"""Database tables (SQLAlchemy 2 typed ORM).

A `Project` is the central record: one `.odx` upload → one project. Metadata,
annotations and analysis runs hang off it by foreign key and are deleted with
it. A project points at a `MachineProfile` (an account's machine data), which
outlives it.

The schema itself is owned by the Alembic migrations in `alembic/versions`;
these classes must describe the same columns. API shapes live separately in
`schemas.py`, so the tables can evolve without changing the public contract.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Project status: `new` on upload, `annotated` once an analysis has created
# annotations; `reviewed` is only ever set through the API (PATCH).
STATUS_NEW = "new"
STATUS_ANNOTATED = "annotated"
STATUS_REVIEWED = "reviewed"
ALLOWED_STATUSES = {STATUS_NEW, STATUS_ANNOTATED, STATUS_REVIEWED}

ALLOWED_DIRECTIONS = {"radial", "axial", "vertical", "horizontal"}

# Annotation authors: each analysis replaces the `auto_physics` rows and
# leaves the others alone.
AUTHOR_USER = "user"
AUTHOR_AUTO_PHYSICS = "auto_physics"
ALLOWED_AUTHORS = {AUTHOR_USER, AUTHOR_AUTO_PHYSICS}

# Annotation types. The analysis writes peaks, bands (possible resonance
# zones) and stationary lines (speed-independent lines); a user writes bands,
# notes and the three kinds of line (`schemas.UserAnnotationType`).
ANNOTATION_STATIONARY_LINE = "stationary_line"
ALLOWED_ANNOTATION_TYPES = {
    "peak",
    "band",
    ANNOTATION_STATIONARY_LINE,
    "note",
    "order_line",
    "frequency_line",
    "speed_line",
}

ANNOTATION_STATUS_ACTIVE = "active"

ANALYSIS_PHYSICS = "physics"
ALLOWED_ANALYSIS_TYPES = {ANALYSIS_PHYSICS}


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True, index=True)
    name: Mapped[str] = mapped_column(default="")
    password_hash: Mapped[str]
    #: False blocks sign-in and every authenticated request; no endpoint sets it.
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    #: UI preferences: only the keys the user has set; `schemas.UserSettings`
    #: fills in the rest. In-place edits of a JSON column are not tracked.
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")
    #: Written into every token issued for the account (claim `ver`); a token
    #: carrying another value is refused. `auth.end_sessions` moves it on.
    token_version: Mapped[int] = mapped_column(default=0, server_default=text("0"))

    projects: Mapped[list[Project]] = relationship(back_populates="owner")


class MeasurementMetadata(Base):
    __tablename__ = "measurement_metadata"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id"), unique=True)
    sensor_location: Mapped[str | None] = mapped_column(default=None)
    sensor_direction: Mapped[str | None] = mapped_column(default=None)
    unit: Mapped[str] = mapped_column(default="mm/s")
    operator: Mapped[str | None] = mapped_column(default=None)
    site: Mapped[str | None] = mapped_column(default=None)

    project: Mapped[Project] = relationship(back_populates="measurement_metadata")


class MachineProfile(Base):
    """A machine profile (`physics.profile.MachineProfileData`), stored as its
    JSON document. Rows with `user_id` NULL are built in (`builtin_key`),
    shared by every account and read-only; `profiles.generic_row` writes
    them on first use."""

    __tablename__ = "machine_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True, default=None
    )
    builtin_key: Mapped[str | None] = mapped_column(unique=True, default=None)
    #: The document's name, for sorting and listing without parsing `data`.
    name: Mapped[str]
    data: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow)


class Annotation(Base):
    __tablename__ = "annotation"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id"), index=True)
    annotation_type: Mapped[str]
    freq_hz: Mapped[float | None] = mapped_column(default=None)
    freq_hz_end: Mapped[float | None] = mapped_column(default=None)
    rpm: Mapped[float | None] = mapped_column(default=None)
    rpm_end: Mapped[float | None] = mapped_column(default=None)
    amplitude: Mapped[float | None] = mapped_column(default=None)
    label: Mapped[str] = mapped_column(default="")
    color: Mapped[str] = mapped_column(default="#1e88e5")
    author: Mapped[str] = mapped_column(default=AUTHOR_USER)
    confidence: Mapped[float] = mapped_column(default=1.0)
    status: Mapped[str] = mapped_column(default=ANNOTATION_STATUS_ACTIVE)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    payload_json: Mapped[str] = mapped_column(default="{}")

    project: Mapped[Project] = relationship(back_populates="annotations")


class AnalysisRun(Base):
    __tablename__ = "analysis_run"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("project.id"), index=True)
    type: Mapped[str]
    #: `analysis.pipeline.PIPELINE_VERSION` of the code that produced the run.
    version: Mapped[str]
    params_json: Mapped[str] = mapped_column(default="{}")
    #: Peaks, resonances, severity and structural-mode checks as JSON text; a
    #: run carries every detected peak (hundreds of kB).
    results_json: Mapped[str] = mapped_column(default="{}")
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    project: Mapped[Project] = relationship(back_populates="analysis_runs")


class Project(Base):
    __tablename__ = "project"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("user.id"), index=True, default=None)
    name: Mapped[str] = mapped_column(index=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow)
    #: The machine profile the analysis uses; NULL = the generic built-in.
    machine_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("machine_profile.id", ondelete="SET NULL"), index=True, default=None
    )
    #: The user picked the profile (or the generic one); a profile imported
    #: later does not take the project over.
    machine_profile_chosen: Mapped[bool] = mapped_column(default=False, server_default=text("0"))
    #: Overrides of the profile's parameters for this measurement, by key
    #: (e.g. the differential speed of this run).
    machine_parameters: Mapped[dict[str, float]] = mapped_column(
        JSON, default=dict, server_default="{}"
    )
    notes_markdown: Mapped[str] = mapped_column(default="")
    status: Mapped[str] = mapped_column(default=STATUS_NEW)
    odx_filename: Mapped[str]
    #: SHA-256 of the upload; indexed but not unique (an export may be
    #: uploaded more than once).
    odx_hash: Mapped[str] = mapped_column(index=True)
    # The upload's shape, stored so listing projects never re-reads the file.
    n_blocks: Mapped[int] = mapped_column(default=0)
    bin_count: Mapped[int] = mapped_column(default=0)
    freq_min_hz: Mapped[float] = mapped_column(default=0.0)
    freq_max_hz: Mapped[float] = mapped_column(default=0.0)
    freq_step_hz: Mapped[float] = mapped_column(default=0.0)
    rpm_min: Mapped[float] = mapped_column(default=0.0)
    rpm_max: Mapped[float] = mapped_column(default=0.0)
    odx_header_path: Mapped[str | None] = mapped_column(default=None)
    odx_export_human: Mapped[str | None] = mapped_column(default=None)
    odx_format_version: Mapped[str | None] = mapped_column(default=None)
    #: The profile recognised from the file at upload (its match patterns).
    detected_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("machine_profile.id", ondelete="SET NULL"), default=None
    )
    #: Selects the permissible-vibration class; falls back to the machine profile's.
    bowl_diameter_mm: Mapped[float | None] = mapped_column(default=None)

    owner: Mapped[User | None] = relationship(back_populates="projects")
    measurement_metadata: Mapped[MeasurementMetadata | None] = relationship(
        back_populates="project", cascade="all, delete-orphan", uselist=False
    )
    machine_profile: Mapped[MachineProfile | None] = relationship(foreign_keys=[machine_profile_id])
    annotations: Mapped[list[Annotation]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    analysis_runs: Mapped[list[AnalysisRun]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
