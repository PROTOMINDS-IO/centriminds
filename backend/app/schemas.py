"""Pydantic DTOs for the HTTP API.

Kept separate from the ORM tables in `models.py` so the wire format and
storage format can evolve independently.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    ValidationError,
    ValidatorFunctionWrapHandler,
    field_validator,
    model_validator,
)
from pydantic_core import PydanticUseDefault

from .auth import PASSWORD_MAX_BYTES, PASSWORD_MIN_LEN
from .physics.profile import Finite as FiniteFloat
from .physics.profile import MachineProfileData


def _as_utc(value: datetime) -> datetime:
    # SQLite hands timestamps back naive; they are stored in UTC. Mark them so
    # the JSON carries "+00:00" and browsers do not read them as local time.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


UtcDatetime = Annotated[datetime, AfterValidator(_as_utc)]


def _fits_bcrypt(value: str) -> str:
    # max_length counts characters, bcrypt counts bytes ("ä" is two).
    if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError(f"Password must be at most {PASSWORD_MAX_BYTES} bytes")
    return value


#: A password about to be hashed (sign-up, password change).
NewPassword = Annotated[
    str,
    Field(min_length=PASSWORD_MIN_LEN, max_length=PASSWORD_MAX_BYTES),
    AfterValidator(_fits_bcrypt),
]

Theme = Literal["system", "light", "dark"]
Language = Literal["auto", "en", "de"]
DefaultView = Literal["3d", "top"]
DefaultScale = Literal["linear", "log"]
#: Colour schemes of the amplitude surfaces (frontend/src/lib/colormaps.ts).
Colormap = Literal["viridis", "magma", "ocean", "teal", "graphite"]
#: How the colour scheme spreads over amplitude on the linear scale.
ColourSpread = Literal["even", "balanced", "detail"]


class UserSettings(BaseModel):
    """The account's UI preferences, always complete on the wire."""

    model_config = ConfigDict(extra="ignore")  # tolerate stale keys stored earlier

    theme: Theme = "dark"
    language: Language = "auto"
    #: None = device default (on unless the OS asks for reduced motion).
    auto_rotate: bool | None = None
    default_view: DefaultView = "3d"
    default_scale: DefaultScale = "linear"
    colormap: Colormap = "viridis"
    colour_spread: ColourSpread = "balanced"

    @field_validator("*", mode="wrap")
    @classmethod
    def _default_if_invalid(cls, value: Any, handler: ValidatorFunctionWrapHandler) -> Any:
        # Built from stored JSON: a value this version no longer accepts falls
        # back to the default instead of failing every request of that user.
        try:
            return handler(value)
        except ValidationError as exc:
            raise PydanticUseDefault from exc


class UserSettingsUpdate(BaseModel):
    """Settings to change; keys left out keep their stored value."""

    model_config = ConfigDict(extra="forbid")

    theme: Theme | None = None
    language: Language | None = None
    auto_rotate: bool | None = None
    default_view: DefaultView | None = None
    default_scale: DefaultScale | None = None
    colormap: Colormap | None = None
    colour_spread: ColourSpread | None = None

    def changes(self) -> dict[str, Any]:
        """The keys sent in the request. null counts as not sent, except for
        auto_rotate, where it is a value: back to the device default."""
        sent = self.model_dump(exclude_unset=True)
        return {k: v for k, v in sent.items() if v is not None or k == "auto_rotate"}


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    created_at: UtcDatetime
    settings: UserSettings

    @field_validator("settings", mode="before")
    @classmethod
    def _object_or_defaults(cls, value: Any) -> Any:
        # The column holds a JSON object; anything else (a hand-edited row) reads as defaults.
        return value if isinstance(value, dict | UserSettings) else {}


#: A person's name, trimmed; the same limit at sign-up and on a rename.
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)]


class UserCreate(BaseModel):
    email: EmailStr
    name: DisplayName = ""
    password: NewPassword


class UserUpdate(BaseModel):
    """PATCH /api/auth/me. Fields left out (or null) stay as they are."""

    model_config = ConfigDict(extra="forbid")

    name: DisplayName | None = None
    settings: UserSettingsUpdate | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=PASSWORD_MAX_BYTES)
    new_password: NewPassword


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=72)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 (OAuth token type, not a secret)
    user: UserRead


class MeasurementMetadataRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sensor_location: str | None = None
    sensor_direction: str | None = None
    unit: str = "mm/s"
    operator: str | None = None
    site: str | None = None


class MeasurementMetadataUpdate(BaseModel):
    sensor_location: str | None = None
    sensor_direction: str | None = None
    unit: str | None = None
    operator: str | None = None
    site: str | None = None

    @field_validator("unit")
    @classmethod
    def _unit_not_cleared(cls, value: str | None) -> str:
        # Runs only when a unit is sent: the stored one can be changed, but
        # the column cannot be empty.
        if value is None or not value.strip():
            raise ValueError("the unit cannot be cleared")
        return value.strip()


class ProjectRead(BaseModel):
    """Slim project summary for list views."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: UtcDatetime
    updated_at: UtcDatetime
    #: None = the generic built-in profile.
    machine_profile_id: int | None = None
    #: The profile's name (the generic one's when none is set).
    machine_name: str = ""
    machine_parameters: dict[str, float] = Field(default_factory=dict)
    notes_markdown: str
    status: str
    odx_filename: str
    odx_hash: str
    n_blocks: int
    bin_count: int
    freq_min_hz: float
    freq_max_hz: float
    freq_step_hz: float
    rpm_min: float
    rpm_max: float
    odx_header_path: str | None = None
    odx_export_human: str | None = None
    odx_format_version: str | None = None
    detected_profile_id: int | None = None
    bowl_diameter_mm: float | None = None
    #: From the latest physics run, for the project list; None until analysed.
    severity_zone: str | None = None
    severity_mm_s: float | None = None


class ProjectDetail(ProjectRead):
    """Full project record with nested metadata.

    Spectrogram matrix is served by a dedicated endpoint to keep this small.
    """

    measurement_metadata: MeasurementMetadataRead | None = None
    #: Fingerprint of the analysis inputs (profile, parameters, diameter): a
    #: run with another `params.inputs_hash` is out of date.
    analysis_inputs_hash: str = ""


class ProjectUpdate(BaseModel):
    """PATCH /api/projects/{id}. Fields left out keep their value. A top-level
    null does too, except for `bowl_diameter_mm`; inside the nested objects
    every key sent is applied, null included."""

    name: str | None = None
    notes_markdown: str | None = None
    status: str | None = None
    #: Send null explicitly to use the generic profile.
    machine_profile_id: int | None = None
    #: Replaces the overrides; a parameter left out uses the profile's value.
    machine_parameters: dict[str, FiniteFloat] | None = Field(default=None, max_length=60)
    #: Send null explicitly to clear it (fall back to the profile's diameter).
    bowl_diameter_mm: float | None = Field(default=None, gt=0, le=3000)
    measurement_metadata: MeasurementMetadataUpdate | None = None


class MachineProfileRead(BaseModel):
    """A machine profile: its document (`data`) and how it is stored."""

    id: int
    #: Built in: shared by every account, read-only.
    builtin: bool
    name: str
    data: MachineProfileData
    created_at: UtcDatetime
    updated_at: UtcDatetime
    #: The account's projects using it (for the generic one: those without a profile).
    project_count: int = 0


class MachineProfileSaved(MachineProfileRead):
    #: Projects without a profile that this one recognised and now uses.
    assigned_projects: int = 0


class ProfileImportItem(BaseModel):
    profile: MachineProfileSaved
    #: Where it came from (the sheet, or the file).
    source: str
    warnings: list[str] = Field(default_factory=list)


class ProfileImportResponse(BaseModel):
    imported: list[ProfileImportItem]


class TemplateRead(BaseModel):
    id: str
    data: MachineProfileData


class ComponentCheckRead(BaseModel):
    key: str
    speed_rpm: float | None
    freq_hz: float | None
    reference_rpm: float | None
    delta_rpm: float | None
    error: str | None = None


class PointCheckRead(BaseModel):
    label: str
    bowl_rpm: float
    components: list[ComponentCheckRead]


class ProfileProblem(BaseModel):
    #: Where in the document ("components.2.speed_rpm"; empty for the whole).
    loc: str
    msg: str


class ProfileCheckResponse(BaseModel):
    points: list[PointCheckRead]
    #: Why the draft is not valid; empty when it is (and `points` is filled).
    problems: list[ProfileProblem] = Field(default_factory=list)


class DeleteResponse(BaseModel):
    deleted: int = Field(..., description="Number of rows deleted (0 or 1).")


class ThumbnailRead(BaseModel):
    """Tiny spectrogram preview, sized for inline rendering in the project list.

    `z_matrix` is shape (n_blocks, bin_count) — typically 24×64 — so the
    client can paint it on a canvas without a second request to the full
    spectrogram. Values are normalised to [0, 1] of the thumbnail's own
    maximum.
    """

    project_id: int
    n_blocks: int
    bin_count: int
    rpm_min: float
    rpm_max: float
    freq_min_hz: float
    freq_max_hz: float
    z_matrix: list[list[float]]


class SpectrogramRead(BaseModel):
    """Spectrogram payload for the 3D waterfall (perspective and top view).

    `z_matrix[i][j]` is the amplitude at block i, frequency bin j.
    `source_n_blocks` and `source_bin_count` reflect the on-disk shape so
    the client can tell whether it received the full file or a downsample.
    """

    project_id: int
    n_blocks: int
    bin_count: int
    source_n_blocks: int
    source_bin_count: int
    freq_axis: list[float]
    ref_speeds: list[float]
    ref_loads: list[float]
    dates_unix: list[int]
    dates_human: list[str]
    z_matrix: list[list[float]]


class AnnotationRead(BaseModel):
    """Annotation row with parsed `payload_json`."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    annotation_type: str
    freq_hz: float | None = None
    freq_hz_end: float | None = None
    rpm: float | None = None
    rpm_end: float | None = None
    amplitude: float | None = None
    label: str
    color: str
    author: str
    confidence: float
    status: str
    created_at: UtcDatetime
    payload: dict[str, Any] = Field(default_factory=dict)


UserAnnotationType = Literal["band", "note", "order_line", "frequency_line", "speed_line"]
Hz = Annotated[float, Field(ge=0, le=100_000)]
Rpm = Annotated[float, Field(ge=0, le=100_000)]


class AnnotationWrite(BaseModel):
    """A user's annotation on the waterfall. What each type uses:

    * frequency_line — `freq_hz` (a line across every speed)
    * speed_line — `rpm` (a line across every frequency)
    * band — `freq_hz`…`freq_hz_end`, optionally only `rpm`…`rpm_end`
    * note — a callout at `freq_hz`, `rpm`
    * order_line — `payload.order` × the measured speed (e.g. 0.5 for a
      half-speed whirl), or `payload.component` and `payload.order` to pin
      one of the profile's lines
    """

    model_config = ConfigDict(extra="forbid")

    annotation_type: UserAnnotationType
    freq_hz: Hz | None = None
    freq_hz_end: Hz | None = None
    rpm: Rpm | None = None
    rpm_end: Rpm | None = None
    label: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    #: A colour slot of the scene palette ("slot:0"…) or a #rrggbb colour.
    color: Annotated[str, StringConstraints(pattern=r"^(slot:\d{1,2}|#[0-9a-fA-F]{6})$")] = "slot:0"
    #: Longer text of a note.
    text: Annotated[str, StringConstraints(max_length=2000)] = ""
    order: float | None = Field(default=None, gt=0, le=100)
    component: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _has_position(self) -> AnnotationWrite:
        kind = self.annotation_type
        need = {
            "frequency_line": ("freq_hz",),
            "speed_line": ("rpm",),
            "band": ("freq_hz", "freq_hz_end"),
            "note": ("freq_hz", "rpm"),
            "order_line": ("order",),
        }[kind]
        missing = [f for f in need if getattr(self, f) is None]
        if missing:
            raise ValueError(f"a {kind} needs {', '.join(missing)}")
        if kind == "band" and self.freq_hz_end <= self.freq_hz:  # type: ignore[operator]
            raise ValueError("freq_hz_end must be above freq_hz")
        if self.rpm is not None and self.rpm_end is not None and self.rpm_end <= self.rpm:
            raise ValueError("rpm_end must be above rpm")
        return self


class AnalysisRunRead(BaseModel):
    """An AnalysisRun row with `params_json` and `results_json` parsed."""

    id: int
    project_id: int
    type: str
    version: str
    params: dict[str, Any]
    results: dict[str, Any]
    created_at: UtcDatetime


class AnalysisParams(BaseModel):
    """Optional overrides of the physics pipeline defaults
    (`analysis/pipeline.py` DEFAULT_PHYSICS_PARAMS). The bounds keep one request from tying up the
    server (e.g. millions of harmonics per source)."""

    model_config = ConfigDict(extra="forbid")

    prominence_ratio: float | None = Field(None, gt=0, le=1)
    max_peaks_per_block: int | None = Field(None, ge=1, le=200)
    attribution_tolerance_hz: float | None = Field(None, gt=0, le=50)
    max_harmonic: int | None = Field(None, ge=1, le=50)
    zone_max_order: int | None = Field(None, ge=1, le=50)
    zone_min_prominence_db: float | None = Field(None, gt=0, le=60)
    zone_single_line_db: float | None = Field(None, gt=0, le=60)
    stationary_min_contrast: float | None = Field(None, gt=1, le=1000)
    severity_band_lo_hz: float | None = Field(None, ge=0, le=100_000)
    severity_band_hi_hz: float | None = Field(None, gt=0, le=100_000)
    spectrum_amplitude: Literal["rms", "peak"] | None = None
    operating_speed_fraction: float | None = Field(None, gt=0, le=1)
    structural_mode_tolerance: float | None = Field(None, gt=0, le=1)

    @model_validator(mode="after")
    def _band_ordered(self) -> AnalysisParams:
        # Checked when both ends are sent. A band emptied by one end and the
        # other's default is refused by the rating (422 not_ratable).
        lo, hi = self.severity_band_lo_hz, self.severity_band_hi_hz
        if lo is not None and hi is not None and lo >= hi:
            raise ValueError("severity_band_lo_hz must be below severity_band_hi_hz")
        return self

    def overrides(self) -> dict[str, Any]:
        return self.model_dump(exclude_none=True)


class AnalyzeRequest(BaseModel):
    """Optional body for POST /analyze; an empty body uses the defaults."""

    params: AnalysisParams | None = None


class AnalyzeResponse(BaseModel):
    """The run an analysis stored; its results are read through
    GET /analyses (the web app reloads them)."""

    project_id: int
    run_id: int
    version: str
    created_at: UtcDatetime
    annotations_created: int
