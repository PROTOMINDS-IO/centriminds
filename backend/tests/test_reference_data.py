"""Checks against real commissioning data, kept outside the repository.

Point REFERENCE_DIR at a folder holding a machine speeds workbook
(``*.xlsx``) and the speed sweeps (``*.odx``, any depth) of the machines it
describes; ``make check-reference REFERENCE_DIR=…`` mounts it read-only.
Without it these tests skip: customer data never enters the repository.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.analysis.pipeline import DEFAULT_PHYSICS_PARAMS, analyse
from app.analysis.spectrogram import arrays_from_parsed
from app.io.machine_speeds_xlsx import read_machine_speeds
from app.io.odx_parser import parse_odx
from app.physics.kinematics import check_operating_points, compile_machine
from app.profiles import matches

_DIR = Path(os.environ["REFERENCE_DIR"]) if os.environ.get("REFERENCE_DIR") else None
_WORKBOOKS = sorted(_DIR.glob("*.xlsx")) if _DIR else []
_EXPORTS = sorted(_DIR.rglob("*.odx")) if _DIR else []

pytestmark = pytest.mark.skipif(
    not _WORKBOOKS, reason="no reference data; set REFERENCE_DIR to a folder with a workbook"
)


def _profiles():
    return [p.profile for wb in _WORKBOOKS for p in read_machine_speeds(wb.read_bytes())]


def test_workbook_speeds_match_the_formulas() -> None:
    """Every shaft speed the sheets list is what the profile computes (belts
    may differ: some sheets compute a second belt from the bowl speed)."""
    for profile in _profiles():
        kinds = {c.key: c.kind for c in profile.components}
        for point in check_operating_points(profile):
            for row in point.components:
                if row.reference_rpm is None or kinds[row.key] == "belt":
                    continue
                assert abs(row.delta_rpm) < 0.05, (profile.name, point.label, row)


@pytest.mark.parametrize("export", _EXPORTS, ids=lambda p: p.name)
def test_exports_are_recognised_and_analysed(export: Path) -> None:
    odx = parse_odx(export)
    profiles = _profiles()
    scored = [(matches(p.model_dump(), odx.header_path, export.name), p) for p in profiles]
    score, profile = max(scored, key=lambda s: s[0])
    assert score, f"no profile recognises {export.name}"

    physics = analyse(
        arrays_from_parsed(odx), compile_machine(profile), DEFAULT_PHYSICS_PARAMS, None
    )
    assert physics["order_lines"]
    for line in physics["stationary_lines"]:
        if min(abs(line["freq_hz"] - 50 * k) for k in (1, 2, 3)) < 0.5:
            assert line["kind"] == "electrical", line
    for zone in physics["resonance_zones"]:
        assert 0 < zone["lo_hz"] < zone["center_hz"] < zone["hi_hz"]
