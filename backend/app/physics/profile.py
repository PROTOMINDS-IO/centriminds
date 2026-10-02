"""Machine profiles: what the analysis knows about a machine, as data.

A profile is a JSON document (``centriminds.machine-profile``, version 1)
kept per account in the database, imported from a commissioning sheet or a
file, and edited in the web app. The code holds no machine's data, only this
format, the formulas' language (expressions.py) and a few templates.

    parameters        named values: gear ratios, pulley diameters, belt
                      lengths, the differential speed, the mains frequency.
                      `run_specific` marks those that change from one
                      measurement to the next; a project can override any.
    components        the parts that excite vibration. Each has a speed
                      formula in rpm of `n` (the bowl speed, which is the
                      speed an export records), the parameters and the
                      components declared before it. Order k of a component
                      vibrates at k × |speed| / 60 Hz. `kind` tells
                      mechanical parts from electrical lines (mains), which
                      do not follow the speed.
    operating_points  speeds the machine is specified at, with the
                      parameter values there and, optionally, the component
                      speeds a commissioning sheet gives, to check the
                      formulas against.
    structural_modes  natural frequencies known from FE studies or tests.
    resonance_zones   frequency ranges known to amplify vibration.
    match_patterns    text in an export's path or file name that identifies
                      the machine, so uploads pick the profile by themselves.
"""

from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from .expressions import IDENTIFIER, RESERVED_NAMES, FormulaError, names_in, parse

PROFILE_FORMAT = "centriminds.machine-profile"
PROFILE_VERSION = 1

#: Mechanical kinds follow the speed; electrical lines stay where the
#: formula puts them (usually the mains frequency and its multiples).
ComponentKind = Literal["shaft", "belt", "gear_mesh", "electrical", "other"]
MECHANICAL_KINDS = frozenset({"shaft", "belt", "gear_mesh", "other"})


def _identifier(value: str) -> str:
    if not IDENTIFIER.match(value):
        raise ValueError(
            "use letters, digits and _ (up to 40 characters, not starting with a digit)"
        )
    if value in RESERVED_NAMES:
        raise ValueError(f"'{value}' is reserved in formulas")
    return value


def _finite(value: float) -> float:
    if not math.isfinite(value):
        raise ValueError("must be a finite number")
    return value


def _problem(message: str, *loc: str | int) -> PydanticCustomError:
    """A mistake found by checking the document as a whole, located at `loc`
    within it (its error context carries the path; the API reports it there
    rather than on the whole document)."""
    return PydanticCustomError("profile_problem", "{message}", {"message": message, "loc": loc})


Identifier = Annotated[str, AfterValidator(_identifier)]
Finite = Annotated[float, AfterValidator(_finite)]
Label = Annotated[str, Field(min_length=1, max_length=80)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Parameter(_Strict):
    key: Identifier
    label: Label
    unit: str = Field(default="", max_length=20)
    value: Finite
    #: Usually differs between measurements (differential speed, mains).
    run_specific: bool = False


class Component(_Strict):
    key: Identifier
    label: Label
    kind: ComponentKind = "shaft"
    #: Speed in rpm (see the module docstring for what it may refer to).
    speed_rpm: str = Field(min_length=1, max_length=500)
    #: Highest order matched against peaks and drawn as a line.
    max_order: int = Field(default=10, ge=1, le=50)


class OperatingPoint(_Strict):
    label: Label
    bowl_rpm: Finite = Field(gt=0, le=100_000)
    #: Parameter values at this point (others keep the profile's value).
    parameters: dict[str, Finite] = Field(default_factory=dict)
    #: Expected component speeds (rpm), e.g. from a commissioning sheet.
    reference_rpm: dict[str, Finite] = Field(default_factory=dict)


class StructuralMode(_Strict):
    name: Label
    freq_hz: Finite = Field(gt=0, le=100_000)
    source: str = Field(default="FE modal analysis", max_length=80)


class FrequencyZone(_Strict):
    label: Label
    lo_hz: Finite = Field(ge=0, le=100_000)
    hi_hz: Finite = Field(gt=0, le=100_000)
    source: str = Field(default="", max_length=80)

    @model_validator(mode="after")
    def _ordered(self) -> FrequencyZone:
        if self.hi_hz <= self.lo_hz:
            raise ValueError("hi_hz must be above lo_hz")
        return self


class MachineProfileData(_Strict):
    format: Literal["centriminds.machine-profile"] = PROFILE_FORMAT
    version: Literal[1] = PROFILE_VERSION
    name: Label
    machine_type: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=2000)
    #: Selects the permissible-vibration class of the rating.
    bowl_diameter_mm: float | None = Field(default=None, gt=0, le=3000)
    match_patterns: list[Annotated[str, Field(min_length=2, max_length=60)]] = Field(
        default_factory=list, max_length=12
    )
    parameters: list[Parameter] = Field(default_factory=list, max_length=60)
    components: list[Component] = Field(min_length=1, max_length=40)
    operating_points: list[OperatingPoint] = Field(default_factory=list, max_length=8)
    structural_modes: list[StructuralMode] = Field(default_factory=list, max_length=20)
    resonance_zones: list[FrequencyZone] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _consistent(self) -> MachineProfileData:
        """Unique names, and formulas that only use what is declared before them."""
        param_keys = [p.key for p in self.parameters]
        comp_keys = [c.key for c in self.components]
        seen: set[str] = set()
        for i, key in enumerate(param_keys + comp_keys):
            if key in seen:
                where = (
                    ("parameters", i)
                    if i < len(param_keys)
                    else ("components", i - len(param_keys))
                )
                raise _problem(f"the name '{key}' is used twice", *where, "key")
            seen.add(key)

        known = set(param_keys)
        for i, comp in enumerate(self.components):
            try:
                tree = parse(comp.speed_rpm)
            except FormulaError as exc:
                raise _problem(
                    f"component '{comp.key}': {exc}", "components", i, "speed_rpm"
                ) from exc
            unknown = names_in(tree) - known - {"n", "pi"}
            if unknown:
                later = sorted(unknown & set(comp_keys))
                hint = f" (declare {', '.join(later)} first)" if later else ""
                raise _problem(
                    f"component '{comp.key}': unknown name {', '.join(sorted(unknown))}{hint}",
                    "components",
                    i,
                    "speed_rpm",
                )
            known.add(comp.key)

        for i, point in enumerate(self.operating_points):
            unknown = set(point.parameters) - set(param_keys)
            if unknown:
                raise _problem(
                    f"operating point '{point.label}': unknown parameter "
                    f"{', '.join(sorted(unknown))}",
                    "operating_points",
                    i,
                    "parameters",
                )
            unknown = set(point.reference_rpm) - set(comp_keys)
            if unknown:
                raise _problem(
                    f"operating point '{point.label}': unknown component "
                    f"{', '.join(sorted(unknown))}",
                    "operating_points",
                    i,
                    "reference_rpm",
                )
        return self

    def parameter_values(self) -> dict[str, float]:
        return {p.key: p.value for p in self.parameters}
