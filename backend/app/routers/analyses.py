"""Analysis-pipeline endpoints.

* `POST /api/projects/{id}/analyze` — run the physics analysis.
* `GET  /api/projects/{id}/analyses` — list past runs (latest first).
* `GET  /api/projects/{id}/analyses/{run_id}` — fetch one run.
* `GET  /api/projects/{id}/annotations` — list annotations (auto + user).
* `POST /api/projects/{id}/annotations` — add a user annotation.
* `PUT  /api/projects/{id}/annotations/{ann_id}` — change one.
* `DELETE /api/projects/{id}/annotations/{ann_id}` — remove one.

Auto-physics annotations are regenerated on every `/analyze` call and cannot
be edited; user-authored annotations are preserved across runs.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..analysis.decanter_severity import NotRatableError
from ..analysis.pipeline import PIPELINE_VERSION, run_and_persist
from ..auth import get_current_user
from ..config import Settings, get_settings
from ..db import get_session
from ..errors import AppError
from ..models import (
    ALLOWED_ANALYSIS_TYPES,
    ALLOWED_ANNOTATION_TYPES,
    ALLOWED_AUTHORS,
    AUTHOR_USER,
    AnalysisRun,
    Annotation,
    User,
)
from ..physics.expressions import FormulaError
from ..profiles import inputs_hash, project_profile
from ..schemas import (
    AnalysisRunRead,
    AnalyzeRequest,
    AnalyzeResponse,
    AnnotationRead,
    AnnotationWrite,
    DeleteResponse,
)
from ._common import STORED_ODX_ERRORS, require_project, stored_odx_error

router = APIRouter(prefix="/api/projects", tags=["analyses"])


def _check_filter(name: str, value: str | None, allowed: set[str], code: str) -> None:
    if value is not None and value not in allowed:
        choices = sorted(allowed)
        raise AppError(
            400,
            code,
            f"{name} must be one of {choices}",
            params={"value": value, "allowed": choices},
        )


def _run_to_read(run: AnalysisRun) -> AnalysisRunRead:
    return AnalysisRunRead(
        id=run.id,
        project_id=run.project_id,
        type=run.type,
        version=run.version,
        params=json.loads(run.params_json or "{}"),
        results=json.loads(run.results_json or "{}"),
        created_at=run.created_at,
    )


def _annotation_to_read(ann: Annotation) -> AnnotationRead:
    return AnnotationRead(
        id=ann.id,
        project_id=ann.project_id,
        annotation_type=ann.annotation_type,
        freq_hz=ann.freq_hz,
        freq_hz_end=ann.freq_hz_end,
        rpm=ann.rpm,
        rpm_end=ann.rpm_end,
        amplitude=ann.amplitude,
        label=ann.label,
        color=ann.color,
        author=ann.author,
        confidence=ann.confidence,
        status=ann.status,
        created_at=ann.created_at,
        payload=json.loads(ann.payload_json or "{}"),
    )


@router.post("/{project_id}/analyze", response_model=AnalyzeResponse, status_code=201)
def analyze_project(
    project_id: int,
    body: AnalyzeRequest | None = None,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> AnalyzeResponse:
    project = require_project(project_id, session, current_user)
    body = body or AnalyzeRequest()
    _, profile = project_profile(session, project)
    # Parameters out of range never get here (`schemas.AnalysisParams`, 422):
    # an error not caught below is a server error.
    try:
        run, annotations_created = run_and_persist(
            session,
            settings,
            project,
            profile,
            inputs_hash(PIPELINE_VERSION, project, profile),
            physics_params_overrides=body.params.overrides() if body.params else None,
        )
    except STORED_ODX_ERRORS as exc:
        raise stored_odx_error(exc) from exc
    except FormulaError as exc:
        raise AppError(
            422,
            "profile_formula_error",
            f"The machine profile cannot be evaluated: {exc}",
            params={"reason": str(exc)},
        ) from exc
    except NotRatableError as exc:
        raise AppError(
            422,
            "not_ratable",
            str(exc),
            params={"band_lo_hz": exc.band_lo_hz, "band_hi_hz": exc.band_hi_hz},
        ) from exc

    return AnalyzeResponse(
        project_id=project_id,
        run_id=run.id,
        version=run.version,
        created_at=run.created_at,
        annotations_created=annotations_created,
    )


@router.get("/{project_id}/analyses", response_model=list[AnalysisRunRead])
def list_analyses(
    project_id: int,
    type: str | None = Query(None, description="Filter by analysis type"),
    limit: int | None = Query(
        None, ge=1, le=500, description="Newest N runs only (a run carries every peak)"
    ),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AnalysisRunRead]:
    require_project(project_id, session, current_user)
    _check_filter("type", type, ALLOWED_ANALYSIS_TYPES, "invalid_analysis_type")
    stmt = select(AnalysisRun).where(AnalysisRun.project_id == project_id)
    if type is not None:
        stmt = stmt.where(AnalysisRun.type == type)
    stmt = stmt.order_by(AnalysisRun.created_at.desc(), AnalysisRun.id.desc())
    if limit is not None:
        stmt = stmt.limit(limit)
    return [_run_to_read(r) for r in session.scalars(stmt).all()]


@router.get("/{project_id}/analyses/{run_id}", response_model=AnalysisRunRead)
def get_analysis(
    project_id: int,
    run_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AnalysisRunRead:
    require_project(project_id, session, current_user)
    run = session.get(AnalysisRun, run_id)
    if run is None or run.project_id != project_id:
        raise AppError(404, "analysis_not_found", "Analysis run not found")
    return _run_to_read(run)


@router.get("/{project_id}/annotations", response_model=list[AnnotationRead])
def list_annotations(
    project_id: int,
    author: str | None = Query(None, description="Filter by annotation author"),
    annotation_type: str | None = Query(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[AnnotationRead]:
    require_project(project_id, session, current_user)
    _check_filter("author", author, ALLOWED_AUTHORS, "invalid_annotation_author")
    _check_filter(
        "annotation_type", annotation_type, ALLOWED_ANNOTATION_TYPES, "invalid_annotation_type"
    )
    stmt = select(Annotation).where(Annotation.project_id == project_id)
    if author is not None:
        stmt = stmt.where(Annotation.author == author)
    if annotation_type is not None:
        stmt = stmt.where(Annotation.annotation_type == annotation_type)
    stmt = stmt.order_by(Annotation.freq_hz, Annotation.id)
    return [_annotation_to_read(a) for a in session.scalars(stmt).all()]


def _apply(ann: Annotation, body: AnnotationWrite) -> None:
    ann.annotation_type = body.annotation_type
    ann.freq_hz = body.freq_hz
    ann.freq_hz_end = body.freq_hz_end
    ann.rpm = body.rpm
    ann.rpm_end = body.rpm_end
    ann.label = body.label
    ann.color = body.color
    payload = {"text": body.text, "order": body.order, "component": body.component}
    ann.payload_json = json.dumps({k: v for k, v in payload.items() if v not in (None, "")})


def _check_user_annotation(ann: Annotation) -> None:
    if ann.author != AUTHOR_USER:
        raise AppError(
            403, "annotation_read_only", "The analysis's own annotations cannot be changed"
        )


def _require_user_annotation(
    project_id: int, annotation_id: int, session: Session, current_user: User
) -> Annotation:
    require_project(project_id, session, current_user)
    ann = session.get(Annotation, annotation_id)
    if ann is None or ann.project_id != project_id:
        raise AppError(404, "annotation_not_found", "Annotation not found")
    _check_user_annotation(ann)
    return ann


@router.post("/{project_id}/annotations", response_model=AnnotationRead, status_code=201)
def create_annotation(
    project_id: int,
    body: AnnotationWrite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AnnotationRead:
    require_project(project_id, session, current_user)
    ann = Annotation(project_id=project_id, author=AUTHOR_USER, annotation_type="note")
    _apply(ann, body)
    session.add(ann)
    session.commit()
    session.refresh(ann)
    return _annotation_to_read(ann)


@router.put("/{project_id}/annotations/{annotation_id}", response_model=AnnotationRead)
def replace_annotation(
    project_id: int,
    annotation_id: int,
    body: AnnotationWrite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AnnotationRead:
    ann = _require_user_annotation(project_id, annotation_id, session, current_user)
    _apply(ann, body)
    session.commit()
    session.refresh(ann)
    return _annotation_to_read(ann)


@router.delete("/{project_id}/annotations/{annotation_id}", response_model=DeleteResponse)
def delete_annotation(
    project_id: int,
    annotation_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DeleteResponse:
    require_project(project_id, session, current_user)
    ann = session.get(Annotation, annotation_id)
    if ann is None or ann.project_id != project_id:
        return DeleteResponse(deleted=0)
    _check_user_annotation(ann)
    session.delete(ann)
    session.commit()
    return DeleteResponse(deleted=1)
