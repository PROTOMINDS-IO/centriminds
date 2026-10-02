"""Machine profiles: the account's machine data, templates and imports.

* `GET    /api/machines/profiles` — built-ins and the account's own
* `POST   /api/machines/profiles` — create from a document
* `GET    /api/machines/profiles/{id}`
* `PUT    /api/machines/profiles/{id}` — replace the document
* `DELETE /api/machines/profiles/{id}` — its projects fall back to generic
* `POST   /api/machines/profiles/import` — .xlsx commissioning sheet or .json
* `GET    /api/machines/templates` — starting points for a new profile
* `POST   /api/machines/check` — a draft's problems, or its speeds at its
  operating points

Documents are validated here rather than by FastAPI, so a mistake comes
back as one `invalid_profile` error listing where each problem is.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_session
from ..errors import AppError
from ..io.machine_speeds_xlsx import WorkbookError, read_machine_speeds
from ..models import MachineProfile, Project, User
from ..physics.kinematics import check_operating_points
from ..physics.profile import MachineProfileData
from ..physics.templates import TEMPLATES, template
from ..profiles import (
    assign_to_matching_projects,
    require_own,
    require_visible,
    visible_profiles,
)
from ..schemas import (
    DeleteResponse,
    MachineProfileRead,
    MachineProfileSaved,
    ProfileCheckResponse,
    ProfileImportItem,
    ProfileImportResponse,
    TemplateRead,
)

router = APIRouter(prefix="/api/machines", tags=["machines"])

#: Largest import accepted: commissioning sheets are tens of kB.
MAX_IMPORT_BYTES = 2 * 1024 * 1024
#: Most profiles one import can create.
MAX_IMPORT_PROFILES = 50


def _validate(raw: Any, where: str = "") -> MachineProfileData:
    try:
        return MachineProfileData.model_validate(raw)
    except ValidationError as exc:
        errors = []
        for err in exc.errors(include_url=False, include_input=False):
            # A problem of the document as a whole names where it lies.
            path = (*err["loc"], *err.get("ctx", {}).get("loc", ()))
            loc = ".".join(str(p) for p in path)
            msg = str(err["msg"]).removeprefix("Value error, ")
            errors.append({"loc": f"{where}{loc}" if loc else where.rstrip("."), "msg": msg})
        first = errors[0]
        text = f"{first['loc']}: {first['msg']}" if first["loc"] else first["msg"]
        more = f" (and {len(errors) - 1} more)" if len(errors) > 1 else ""
        raise AppError(
            422,
            "invalid_profile",
            f"The machine profile is not valid: {text}{more}",
            params={"errors": errors},
        ) from exc


def _counts(session: Session, user: User) -> dict[int | None, int]:
    rows = session.execute(
        select(Project.machine_profile_id, func.count())
        .where(Project.user_id == user.id)
        .group_by(Project.machine_profile_id)
    ).all()
    return {pid: n for pid, n in rows}


def _read(row: MachineProfile, counts: dict[int | None, int]) -> MachineProfileRead:
    builtin = row.user_id is None
    # Projects without a profile use the generic built-in.
    count = counts.get(row.id, 0) + (counts.get(None, 0) if row.builtin_key == "generic" else 0)
    return MachineProfileRead(
        id=row.id,
        builtin=builtin,
        name=row.name,
        data=MachineProfileData.model_validate(row.data),
        created_at=row.created_at,
        updated_at=row.updated_at,
        project_count=count,
    )


def _create(
    session: Session, user: User, docs: list[MachineProfileData]
) -> list[MachineProfileSaved]:
    """Store profiles and let them take over the projects they recognise, in
    one transaction."""
    rows = [
        MachineProfile(user_id=user.id, name=d.name, data=d.model_dump(mode="json")) for d in docs
    ]
    session.add_all(rows)
    session.flush()
    assigned = assign_to_matching_projects(session, user, rows)
    session.commit()
    counts = _counts(session, user)
    return [
        MachineProfileSaved(**_read(row, counts).model_dump(), assigned_projects=assigned[row.id])
        for row in rows
    ]


@router.get("/profiles", response_model=list[MachineProfileRead])
def list_profiles(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[MachineProfileRead]:
    counts = _counts(session, current_user)
    return [_read(r, counts) for r in visible_profiles(session, current_user)]


@router.post("/profiles", response_model=MachineProfileSaved, status_code=201)
def create_profile(
    data: dict[str, Any] = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MachineProfileSaved:
    [saved] = _create(session, current_user, [_validate(data, "data.")])
    return saved


@router.get("/profiles/{profile_id}", response_model=MachineProfileRead)
def get_profile(
    profile_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MachineProfileRead:
    row = require_visible(session, current_user, profile_id)
    return _read(row, _counts(session, current_user))


@router.put("/profiles/{profile_id}", response_model=MachineProfileRead)
def replace_profile(
    profile_id: int,
    data: dict[str, Any] = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MachineProfileRead:
    row = require_own(session, current_user, profile_id)
    doc = _validate(data, "data.")
    row.data = doc.model_dump(mode="json")
    row.name = doc.name
    row.updated_at = datetime.now(UTC)
    # Changed match patterns may recognise projects better than before.
    assign_to_matching_projects(session, current_user, [row])
    session.commit()
    session.refresh(row)
    return _read(row, _counts(session, current_user))


@router.delete("/profiles/{profile_id}", response_model=DeleteResponse)
def delete_profile(
    profile_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> DeleteResponse:
    row = session.get(MachineProfile, profile_id)
    if row is None or (row.user_id is not None and row.user_id != current_user.id):
        return DeleteResponse(deleted=0)
    require_own(session, current_user, profile_id)  # built-ins cannot go
    # The foreign keys set the projects' references to NULL (generic).
    session.delete(row)
    session.commit()
    return DeleteResponse(deleted=1)


def _json_documents(content: bytes) -> list[Any]:
    try:
        raw = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AppError(400, "import_unreadable", "The file is not valid JSON") from exc
    if isinstance(raw, dict) and isinstance(raw.get("profiles"), list):
        return raw["profiles"]
    if isinstance(raw, dict) and isinstance(raw.get("data"), dict):
        return [raw["data"]]  # a profile as the API returns it
    return raw if isinstance(raw, list) else [raw]


@router.post("/profiles/import", response_model=ProfileImportResponse, status_code=201)
async def import_profiles(
    file: UploadFile = File(..., description=".xlsx machine speeds workbook or .json profile(s)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ProfileImportResponse:
    content = await file.read(MAX_IMPORT_BYTES + 1)
    if len(content) > MAX_IMPORT_BYTES:
        raise AppError(
            413,
            "file_too_large",
            "File is larger than 2 MB",
            params={"max_mb": MAX_IMPORT_BYTES // (1024 * 1024)},
        )
    # Parsing a workbook and writing the profiles are CPU and database work:
    # off the event loop.
    return await run_in_threadpool(_import, session, current_user, content, file.filename or "")


def _import(
    session: Session, current_user: User, content: bytes, filename: str
) -> ProfileImportResponse:
    name = filename.lower()
    found: list[tuple[MachineProfileData, str, list[str]]] = []
    if name.endswith(".json") or content.lstrip()[:1] in (b"{", b"["):
        docs = _json_documents(content)
        for i, doc in enumerate(docs[:MAX_IMPORT_PROFILES]):
            where = f"profiles.{i}." if len(docs) > 1 else ""
            found.append((_validate(doc, where), filename or "JSON", []))
    else:
        try:
            sheets = read_machine_speeds(content)
        except WorkbookError as exc:
            raise AppError(
                400,
                "import_unreadable",
                f"Cannot import the file: {exc}",
                params={"reason": str(exc)},
            ) from exc
        found = [(s.profile, s.sheet, s.warnings) for s in sheets[:MAX_IMPORT_PROFILES]]
    if not found:
        raise AppError(400, "import_unreadable", "The file contains no machine profile")
    saved = _create(session, current_user, [data for data, _, _ in found])
    return ProfileImportResponse(
        imported=[
            ProfileImportItem(profile=profile, source=source, warnings=warnings)
            for profile, (_, source, warnings) in zip(saved, found, strict=True)
        ]
    )


@router.get("/templates", response_model=list[TemplateRead])
def list_templates(_: User = Depends(get_current_user)) -> list[TemplateRead]:
    return [TemplateRead(id=key, data=template(key)) for key in TEMPLATES]


@router.post("/check", response_model=ProfileCheckResponse)
def check_profile(
    data: dict[str, Any] = Body(..., embed=True),
    _: User = Depends(get_current_user),
) -> ProfileCheckResponse:
    """A draft is checked while it is edited, so what does not validate comes
    back as `problems` (status 200), not as an error."""
    try:
        doc = _validate(data)
    except AppError as exc:
        return ProfileCheckResponse(points=[], problems=exc.params["errors"])
    return ProfileCheckResponse.model_validate(
        {"points": check_operating_points(doc), "problems": []}, from_attributes=True
    )
