"""Component speeds and excitation frequencies of a machine profile.

`Machine` is a profile ready to compute with: its formulas parsed once and
its parameter values settled (the profile's, then a project's overrides).
For a bowl speed it gives every component's speed, and each component's
orders k = 1…max_order excite vibration at k × |speed| / 60 Hz — vibration
sees the magnitude of a rotation, not its direction.
"""

from __future__ import annotations

import ast
from collections.abc import Mapping
from dataclasses import dataclass, field

from .expressions import FormulaError, evaluate, parse
from .profile import MECHANICAL_KINDS, Component, MachineProfileData


@dataclass(frozen=True)
class Excitation:
    source_id: str
    order: int
    freq_hz: float


@dataclass(frozen=True)
class Machine:
    profile: MachineProfileData
    #: Parameter values in use: the profile's, with overrides applied.
    values: dict[str, float]
    _formulas: list[tuple[Component, ast.expr]] = field(repr=False)

    @property
    def components(self) -> list[Component]:
        return [c for c, _ in self._formulas]

    def is_mechanical(self, source_id: str) -> bool:
        return any(c.key == source_id and c.kind in MECHANICAL_KINDS for c, _ in self._formulas)

    def speeds_rpm(
        self, bowl_rpm: float, values: Mapping[str, float] | None = None
    ) -> dict[str, float]:
        """Signed speed of every component (rpm) at this bowl speed."""
        env: dict[str, float] = {**(values or self.values), "n": bowl_rpm}
        out: dict[str, float] = {}
        for comp, tree in self._formulas:
            try:
                speed = evaluate(tree, env)
            except FormulaError as exc:
                raise FormulaError(f"component '{comp.key}': {exc}") from exc
            out[comp.key] = speed
            env[comp.key] = speed
        return out

    def frequencies_hz(self, bowl_rpm: float) -> dict[str, float]:
        """Order-1 frequency of every component (Hz, ≥ 0)."""
        return {k: abs(v) / 60.0 for k, v in self.speeds_rpm(bowl_rpm).items()}

    def excitations(self, bowl_rpm: float, max_order: int | None = None) -> list[Excitation]:
        """Every order of every component at this speed, up to each component's
        `max_order` (and `max_order` here, if given)."""
        freqs = self.frequencies_hz(bowl_rpm)
        out: list[Excitation] = []
        for comp in self.components:
            top = comp.max_order if max_order is None else min(comp.max_order, max_order)
            f1 = freqs[comp.key]
            out.extend(Excitation(comp.key, k, f1 * k) for k in range(1, top + 1))
        return out


def compile_machine(
    profile: MachineProfileData, overrides: Mapping[str, float] | None = None
) -> Machine:
    """A profile with a project's parameter overrides; unknown keys are ignored
    (a parameter the profile no longer has)."""
    values = profile.parameter_values()
    for key, value in (overrides or {}).items():
        if key in values and value is not None:
            values[key] = float(value)
    formulas = [(c, parse(c.speed_rpm)) for c in profile.components]
    return Machine(profile=profile, values=values, _formulas=formulas)


@dataclass(frozen=True)
class ComponentCheck:
    key: str
    speed_rpm: float | None
    freq_hz: float | None
    reference_rpm: float | None
    #: |computed| − |reference| (rpm): directions are not compared, a sheet
    #: often lists magnitudes only.
    delta_rpm: float | None
    error: str | None = None


@dataclass(frozen=True)
class PointCheck:
    label: str
    bowl_rpm: float
    components: list[ComponentCheck]


def check_operating_points(profile: MachineProfileData) -> list[PointCheck]:
    """Each operating point's computed component speeds, beside the reference
    values it carries: the profile editor's verification table."""
    machine = compile_machine(profile)
    out: list[PointCheck] = []
    for point in profile.operating_points:
        values = {**machine.values, **point.parameters}
        rows: list[ComponentCheck] = []
        try:
            speeds = machine.speeds_rpm(point.bowl_rpm, values)
            error = None
        except FormulaError as exc:
            speeds, error = {}, str(exc)
        for comp in profile.components:
            speed = speeds.get(comp.key)
            ref = point.reference_rpm.get(comp.key)
            rows.append(
                ComponentCheck(
                    key=comp.key,
                    speed_rpm=speed,
                    freq_hz=None if speed is None else abs(speed) / 60.0,
                    reference_rpm=ref,
                    delta_rpm=None if speed is None or ref is None else abs(speed) - abs(ref),
                    error=error if speed is None else None,
                )
            )
        out.append(PointCheck(label=point.label, bowl_rpm=point.bowl_rpm, components=rows))
    return out
