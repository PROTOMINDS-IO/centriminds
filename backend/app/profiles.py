"""Machine profiles in the database: built-ins, ownership, recognition.

Each account has its own profiles; the built-in rows (no owner) are visible
to every account and cannot be changed. A project without a profile uses
the generic built-in.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from functools import cache
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .errors import AppError
from .models import MachineProfile, Project, User
from .physics.profile import MachineProfileData
from .physics.templates import GENERIC_KEY, generic_profile


@cache
def _generic_document() -> dict[str, Any]:
    # Cached: it is compared with the stored row on every request that needs
    # the generic profile. Callers must not change it.
    return generic_profile().model_dump(mode="json")


def generic_row(session: Session) -> MachineProfile:
    """The generic built-in, written (or brought up to date) on first use."""
    doc = _generic_document()
    row = session.scalars(
        select(MachineProfile).where(MachineProfile.builtin_key == GENERIC_KEY)
    ).first()
    if row is not None and row.data == doc:
        return row
    try:
        if row is None:
            row = MachineProfile(builtin_key=GENERIC_KEY, name=doc["name"], data=dict(doc))
            session.add(row)
        else:
            row.data, row.name, row.updated_at = dict(doc), doc["name"], datetime.now(UTC)
        session.commit()
    except IntegrityError:  # another request wrote it first
        session.rollback()
        row = session.scalars(
            select(MachineProfile).where(MachineProfile.builtin_key == GENERIC_KEY)
        ).one()
    return row


def visible_profiles(session: Session, user: User) -> list[MachineProfile]:
    """Built-ins first, then the account's own by name."""
    generic_row(session)
    rows = session.scalars(
        select(MachineProfile).where(
            or_(MachineProfile.user_id == user.id, MachineProfile.user_id.is_(None))
        )
    ).all()
    return sorted(rows, key=lambda r: (r.user_id is not None, r.name.lower(), r.id))


def require_visible(session: Session, user: User, profile_id: int) -> MachineProfile:
    row = session.get(MachineProfile, profile_id)
    if row is None or (row.user_id is not None and row.user_id != user.id):
        # 404, not 403: another account's profile must not be confirmed.
        raise AppError(404, "profile_not_found", "Machine profile not found")
    return row


def require_own(session: Session, user: User, profile_id: int) -> MachineProfile:
    row = require_visible(session, user, profile_id)
    if row.user_id is None:
        raise AppError(
            403, "profile_builtin", "Built-in profiles cannot be changed; duplicate it instead"
        )
    return row


def document(row: MachineProfile) -> MachineProfileData:
    return MachineProfileData.model_validate(row.data)


def project_profile(
    session: Session, project: Project
) -> tuple[MachineProfile, MachineProfileData]:
    """The profile the project's analysis uses (the generic one if none is set)."""
    row = project.machine_profile or generic_row(session)
    return row, document(row)


def matches(data: dict[str, Any], *texts: str | None) -> int:
    """Length of the longest of the profile's match patterns found in the
    texts (case-insensitive); 0 if none is."""
    haystack = " ".join(t for t in texts if t).lower()
    if not haystack:
        return 0
    return max(
        (len(p) for p in data.get("match_patterns", []) if p and p.lower() in haystack),
        default=0,
    )


def detect_profile(session: Session, user: User, *texts: str | None) -> MachineProfile | None:
    """The account's profile whose longest match pattern appears in the texts
    (an export's #Path, its file name); the most specific pattern wins, then
    the most recently changed profile."""
    best: tuple[int, datetime, MachineProfile] | None = None
    for row in session.scalars(select(MachineProfile).where(MachineProfile.user_id == user.id)):
        score = matches(row.data, *texts)
        if score and (best is None or (score, row.updated_at) > best[:2]):
            best = (score, row.updated_at, row)
    return best[2] if best else None


def assign_to_matching_projects(
    session: Session, user: User, rows: list[MachineProfile]
) -> dict[int, int]:
    """Give new or changed profiles to the account's projects they recognise
    better than their current profile does: those without one, and those
    whose profile was recognised by a shorter pattern. Between the given
    profiles the longest pattern wins, then the first. A profile the user
    chose is kept. Returns how many projects each profile (by id) took
    over; does not commit."""
    taken = {row.id: 0 for row in rows}
    projects = session.scalars(
        select(Project)
        .where(Project.user_id == user.id, Project.machine_profile_chosen.is_(False))
        .options(selectinload(Project.machine_profile))
    )
    for project in projects:
        texts = (project.odx_header_path, project.odx_filename)
        current = project.machine_profile
        best = matches(current.data, *texts) if current is not None else 0
        winner = None
        for row in rows:
            score = matches(row.data, *texts)
            if score > best:
                winner, best = row, score
        if winner is not None:
            project.machine_profile = winner
            project.detected_profile_id = winner.id
            taken[winner.id] += 1
    return taken


def inputs_hash(pipeline_version: str, project: Project, profile: MachineProfileData) -> str:
    """Fingerprint of everything an analysis result depends on besides the file:
    a run whose fingerprint differs from the project's is out of date."""
    payload = json.dumps(
        {
            "pipeline": pipeline_version,
            "profile": profile.model_dump(mode="json"),
            "parameters": project.machine_parameters or {},
            "bowl_diameter_mm": project.bowl_diameter_mm,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
