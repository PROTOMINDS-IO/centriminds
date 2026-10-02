"""Machine profiles: the document's rules, templates and kinematics."""

from __future__ import annotations

import math

import pytest
from pydantic import ValidationError

from app.physics.kinematics import check_operating_points, compile_machine
from app.physics.profile import MachineProfileData
from app.physics.templates import TEMPLATES, generic_profile, template
from tests.conftest import decanter_document


def _profile(**changes: object) -> MachineProfileData:
    return MachineProfileData.model_validate(decanter_document(**changes))


@pytest.mark.parametrize("template_id", sorted(TEMPLATES))
def test_templates_are_valid_and_evaluate(template_id: str) -> None:
    machine = compile_machine(template(template_id))
    speeds = machine.speeds_rpm(1500)
    assert speeds["bowl"] == 1500
    assert machine.frequencies_hz(1500)["mains"] == 50


def test_generic_profile_is_rotor_and_mains() -> None:
    machine = compile_machine(generic_profile())
    assert machine.frequencies_hz(1200) == {"rotor": 20.0, "mains": 50.0}
    assert machine.is_mechanical("rotor") and not machine.is_mechanical("mains")


def test_cyclo_kinematics() -> None:
    # K1 = -60, K2 = 2 (i = -120), d = 10 rpm, pulleys 300 / 175 mm, belt 2000 mm.
    speeds = compile_machine(_profile()).speeds_rpm(3000)
    assert speeds["scroll"] == pytest.approx(3010)
    assert speeds["main_motor"] == pytest.approx(3000 * 175 / 300)
    assert speeds["secondary_motor"] == pytest.approx(3000 - 10 * 120)
    # sign(K1) * d * K1 * (-sign(i)) = (-1)(10)(-60)(+1) = 600
    assert speeds["intermediate_shaft"] == pytest.approx(2400)
    assert speeds["belt"] == pytest.approx(math.pi * 175 / 2000 * 3000)
    assert speeds["belt_flex"] == pytest.approx(2 * speeds["belt"])


def test_planetary_back_drive_runs_off_the_pinion() -> None:
    machine = compile_machine(template("decanter-planetary"))
    # d = 10, K1·K2 = 40: pinion = n - 400; back-drive = pinion × 500 / 200.
    speeds = machine.speeds_rpm(1600)
    assert speeds["pinion"] == pytest.approx(1200)
    assert speeds["secondary_motor"] == pytest.approx(3000)
    assert speeds["belt2"] == pytest.approx(math.pi * 500 / 5000 * 1200)
    assert speeds["scroll"] == pytest.approx(1590)


def test_project_overrides_replace_parameter_values() -> None:
    machine = compile_machine(_profile(), {"d": 20, "gone": 5})
    assert machine.values["d"] == 20
    assert "gone" not in machine.values
    assert machine.speeds_rpm(3000)["scroll"] == pytest.approx(3020)


def test_excitations_respect_each_components_max_order() -> None:
    machine = compile_machine(generic_profile())
    orders = {(e.source_id, e.order) for e in machine.excitations(1200)}
    assert ("rotor", 10) in orders
    assert ("mains", 3) in orders and ("mains", 4) not in orders
    capped = {(e.source_id, e.order) for e in machine.excitations(1200, max_order=2)}
    assert ("rotor", 3) not in capped


def test_operating_point_check_compares_with_the_sheet() -> None:
    doc = decanter_document(
        operating_points=[
            {
                "label": "Nominal",
                "bowl_rpm": 3000,
                "parameters": {"d": 12},
                "reference_rpm": {"scroll": 3012, "secondary_motor": 1000},
            }
        ]
    )
    [point] = check_operating_points(MachineProfileData.model_validate(doc))
    rows = {c.key: c for c in point.components}
    assert rows["scroll"].delta_rpm == pytest.approx(0)
    # 3000 - 12 * 120 = 1560 against 1000 on the "sheet".
    assert rows["secondary_motor"].delta_rpm == pytest.approx(560)
    assert rows["bowl"].reference_rpm is None and rows["bowl"].freq_hz == 50


def _invalid(**changes: object) -> str:
    with pytest.raises(ValidationError) as exc:
        _profile(**changes)
    return str(exc.value)


def test_rejects_duplicate_and_reserved_names() -> None:
    doc = decanter_document()
    params = [*doc["parameters"], {"key": "bowl", "label": "Clash", "value": 1}]
    assert "used twice" in _invalid(parameters=params)
    params = [*doc["parameters"], {"key": "pi", "label": "Pi", "value": 3}]
    assert "reserved" in _invalid(parameters=params)
    params = [*doc["parameters"], {"key": "2x", "label": "Bad", "value": 3}]
    assert "letters, digits" in _invalid(parameters=params)


def test_rejects_formulas_naming_what_is_not_declared_before() -> None:
    comps = decanter_document()["components"]
    flex = next(c for c in comps if c["key"] == "belt_flex")
    reordered = [flex, *[c for c in comps if c is not flex]]
    assert "declare belt first" in _invalid(components=reordered)
    broken = [{"key": "x", "label": "X", "speed_rpm": "n * nope"}]
    assert "unknown name nope" in _invalid(components=broken)
    assert "is not allowed" in _invalid(
        components=[{"key": "x", "label": "X", "speed_rpm": "n.real"}]
    )


def test_rejects_operating_points_naming_unknown_keys() -> None:
    point = {"label": "P", "bowl_rpm": 1000, "parameters": {"zz": 1}}
    assert "unknown parameter zz" in _invalid(operating_points=[point])
    point = {"label": "P", "bowl_rpm": 1000, "reference_rpm": {"zz": 1}}
    assert "unknown component zz" in _invalid(operating_points=[point])


def test_rejects_upside_down_zones_and_unknown_fields() -> None:
    zone = {"label": "Z", "lo_hz": 70, "hi_hz": 60}
    assert "above lo_hz" in _invalid(resonance_zones=[zone])
    assert "Extra inputs" in _invalid(colour="red")
