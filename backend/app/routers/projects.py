"""CRUD endpoints for Projects.

POST creates a project from a multipart `.odx` upload + metadata form fields.
The file is parsed to validate the format, its shape is cached on the Project
row, and the raw bytes are written to `settings.odx_dir/<project_id>.odx` so
analysis endpoints can re-read them without re-uploading.

Every route sees only the signed-in user's projects; anyone else's are
treated as missing (404, or `deleted: 0` on DELETE).
"""

from __future__ import annotations

import os
from datetime import UTC
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..analysis.pipeline import PIPELINE_VERSION
from ..analysis.spectrogram import prime_cache
from ..auth import get_current_user
from ..config import Settings, get_settings
from ..db import get_session
from ..errors import AppError
from ..io.odx_parser import OdxFile, OdxParseError, parse_odx
from ..models import (
    ALLOWED_DIRECTIONS,
    ALLOWED_STATUSES,
    ANALYSIS_PHYSICS,
    AnalysisRun,
    MeasurementMetadata,
    Project,
    User,
)
from ..profiles import detect_profile, generic_row, inputs_hash, project_profile, require_visible
from ..schemas import (
    DeleteResponse,
    MeasurementMetadataRead,
    ProjectDetail,
    ProjectRead,
    ProjectUpdate,
)
from ._common import require_project

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _project_to_read(
    project: Project, generic_name: str, severity: tuple[str, float] | None = None
) -> ProjectRead:
    read = ProjectRead.model_validate(project, from_attributes=True)
    profile = project.machine_profile
    read.machine_name = profile.name if profile else generic_name
    if severity:
        read.severity_zone, read.severity_mm_s = severity
    return read


def _latest_severities(session: Session, project_ids: list[int]) -> dict[int, tuple[str, float]]:
    """Rating of each project's newest physics run.

    Reads the two fields with SQLite's json_extract instead of loading run
    JSON into Python — a run carries every detected peak (hundreds of kB).
    """
    if not project_ids:
        return {}
    newest = (
        select(func.max(AnalysisRun.id))
        .where(AnalysisRun.project_id.in_(project_ids))  # type: ignore[attr-defined]
        .where(AnalysisRun.type == ANALYSIS_PHYSICS)
        .group_by(AnalysisRun.project_id)
    )
    rows = session.execute(
        select(
            AnalysisRun.project_id,
            func.json_extract(AnalysisRun.results_json, "$.severity.zone"),
            func.json_extract(AnalysisRun.results_json, "$.severity.velocity_mm_s"),
        ).where(AnalysisRun.id.in_(newest))  # type: ignore[attr-defined]
    ).all()
    return {pid: (zone, float(v)) for pid, zone, v in rows if zone is not None}


def _project_to_detail(session: Session, project: Project) -> ProjectDetail:
    row, profile = project_profile(session, project)
    base = _project_to_read(project, row.name).model_dump()
    metadata = (
        MeasurementMetadataRead.model_validate(project.measurement_metadata)
        if project.measurement_metadata
        else None
    )
    return ProjectDetail(
        **base,
        measurement_metadata=metadata,
        analysis_inputs_hash=inputs_hash(PIPELINE_VERSION, project, profile),
    )


def _profile_id_for(session: Session, user: User, profile_id: int | None) -> int | None:
    """A profile the account may use, as stored on a project: the generic
    built-in is stored as None."""
    if profile_id is None:
        return None
    row = require_visible(session, user, profile_id)
    return None if row.user_id is None else row.id


def _validate_sensor_direction(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if value not in ALLOWED_DIRECTIONS:
        allowed = sorted(ALLOWED_DIRECTIONS)
        raise AppError(
            400,
            "invalid_sensor_direction",
            f"sensor_direction must be one of {allowed}",
            params={"value": value, "allowed": allowed},
        )
    return value


def _validate_status(value: str | None) -> str | None:
    if value is None:
        return None
    if value not in ALLOWED_STATUSES:
        allowed = sorted(ALLOWED_STATUSES)
        raise AppError(
            400,
            "invalid_status",
            f"status must be one of {allowed}",
            params={"value": value, "allowed": allowed},
        )
    return value


def _too_large(settings: Settings) -> AppError:
    return AppError(
        413,
        "file_too_large",
        f"File is larger than {settings.max_upload_mb} MB",
        params={"max_mb": settings.max_upload_mb},
    )


@router.post("", response_model=ProjectDetail, status_code=201)
async def create_project(
    file: UploadFile = File(..., description=".odx vibration export"),
    name: str | None = Form(
        None,
        description="Project name. Defaults to the .odx header path or filename if omitted.",
    ),
    machine_profile_id: int | None = Form(
        None,
        description="Machine profile; left out, it is recognised from the file (else generic).",
    ),
    notes_markdown: str = Form(""),
    sensor_location: str | None = Form(None),
    sensor_direction: str | None = Form(None),
    unit: str = Form("mm/s"),
    operator: str | None = Form(None),
    site: str | None = Form(None),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ProjectDetail:
    direction = _validate_sensor_direction(sensor_direction)

    limit = settings.max_upload_bytes
    if file.size is not None and file.size > limit:
        raise _too_large(settings)
    content = await file.read(limit + 1)
    if len(content) > limit:
        raise _too_large(settings)
    try:
        # CPU-bound (tens of milliseconds for a typical sweep): keep it off
        # the event loop.
        parsed = await run_in_threadpool(parse_odx, content)
    except OdxParseError as exc:
        raise AppError(
            400, "odx_parse_failed", f".odx parse failed: {exc}", params={"reason": str(exc)}
        ) from exc

    detected = await run_in_threadpool(
        detect_profile, session, current_user, parsed.header_path, file.filename
    )
    chosen = await run_in_threadpool(_profile_id_for, session, current_user, machine_profile_id)
    if machine_profile_id is None and detected is not None:
        chosen = detected.id

    # Derive a friendly default name when the user didn't supply one.
    resolved_name = (name or "").strip()
    if not resolved_name:
        if parsed.header_path:
            resolved_name = parsed.header_path.replace("\\", " / ")
        elif file.filename:
            resolved_name = file.filename.rsplit(".", 1)[0]
        else:
            resolved_name = "Untitled project"

    project = Project(
        user_id=current_user.id,
        name=resolved_name,
        machine_profile_id=chosen,
        machine_profile_chosen=machine_profile_id is not None,
        notes_markdown=notes_markdown,
        odx_filename=file.filename or "upload.odx",
        odx_hash=parsed.content_sha256,
        n_blocks=len(parsed.ref_speeds),
        bin_count=len(parsed.freq_axis),
        freq_min_hz=parsed.freq_axis[0],
        freq_max_hz=parsed.freq_axis[-1],
        freq_step_hz=(
            parsed.freq_axis[1] - parsed.freq_axis[0] if len(parsed.freq_axis) > 1 else 0.0
        ),
        rpm_min=min(parsed.ref_speeds),
        rpm_max=max(parsed.ref_speeds),
        odx_header_path=parsed.header_path,
        odx_export_human=parsed.header_export_human,
        odx_format_version=parsed.header_format_version,
        detected_profile_id=detected.id if detected else None,
    )
    project.measurement_metadata = MeasurementMetadata(
        sensor_location=sensor_location,
        sensor_direction=direction,
        unit=unit,
        operator=operator,
        site=site,
    )
    # Disk and database work runs in a worker thread, off the event loop.
    await run_in_threadpool(_store_upload, session, settings, project, content, parsed)
    return await run_in_threadpool(_project_to_detail, session, project)


def _store_upload(
    session: Session, settings: Settings, project: Project, content: bytes, parsed: OdxFile
) -> None:
    """Insert the row and write its .odx as one unit.

    flush assigns the id and holds SQLite's write lock until commit: the file
    is in place before the row becomes visible, and an id freed by a delete
    cannot be handed out while that delete is still removing its file.
    """
    session.add(project)
    session.flush()
    settings.ensure_dirs()
    odx_path = settings.odx_dir / f"{project.id}.odx"
    try:
        _write_atomic(odx_path, content)
        session.commit()
    except Exception:
        session.rollback()
        odx_path.unlink(missing_ok=True)
        raise
    session.refresh(project)
    prime_cache(settings, project.id, parsed)


def _write_atomic(path: Path, content: bytes) -> None:
    """Temp file, fsync, rename: readers and backups never see half a file."""
    partial = path.with_name(f".{path.name}.part")
    try:
        with partial.open("wb") as fh:
            fh.write(content)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(partial, path)
    finally:
        partial.unlink(missing_ok=True)


@router.get("", response_model=list[ProjectRead])
def list_projects(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ProjectRead]:
    rows = session.scalars(
        select(Project)
        .where(Project.user_id == current_user.id)
        .options(selectinload(Project.machine_profile))
        .order_by(Project.created_at.desc())
    ).all()
    severities = _latest_severities(session, [p.id for p in rows])
    generic_name = generic_row(session).name
    return [_project_to_read(p, generic_name, severities.get(p.id)) for p in rows]


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProjectDetail:
    project = require_project(project_id, session, current_user)
    return _project_to_detail(session, project)


@router.patch("/{project_id}", response_model=ProjectDetail)
def update_project(
    project_id: int,
    update: ProjectUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProjectDetail:
    from datetime import datetime

    project = require_project(project_id, session, current_user)

    if "machine_profile_id" in update.model_fields_set:
        project.machine_profile_id = _profile_id_for(
            session, current_user, update.machine_profile_id
        )
        project.machine_profile_chosen = True
    if update.machine_parameters is not None:
        project.machine_parameters = dict(update.machine_parameters)
    if update.status is not None:
        project.status = _validate_status(update.status) or project.status
    if update.name is not None:
        project.name = update.name
    if update.notes_markdown is not None:
        project.notes_markdown = update.notes_markdown
    if "bowl_diameter_mm" in update.model_fields_set:
        project.bowl_diameter_mm = update.bowl_diameter_mm

    if update.measurement_metadata is not None:
        meta = project.measurement_metadata or MeasurementMetadata(project_id=project.id)
        for field_name, value in update.measurement_metadata.model_dump(exclude_unset=True).items():
            if field_name == "sensor_direction":
                value = _validate_sensor_direction(value)
            setattr(meta, field_name, value)
        project.measurement_metadata = meta

    project.updated_at = datetime.now(UTC)
    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_to_detail(session, project)


@router.delete("/{project_id}", response_model=DeleteResponse)
def delete_project(
    project_id: int,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> DeleteResponse:
    project = session.get(Project, project_id)
    if project is None or project.user_id != current_user.id:
        return DeleteResponse(deleted=0)
    session.delete(project)
    session.flush()  # write lock held: the id cannot be reissued before the file is gone
    (settings.odx_dir / f"{project_id}.odx").unlink(missing_ok=True)
    session.commit()
    return DeleteResponse(deleted=1)
