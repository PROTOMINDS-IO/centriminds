"""Import of "machine speeds" commissioning workbooks (io/machine_speeds_xlsx.py).

The workbooks here are built in the test with made-up numbers, in the
layout such sheets use; no customer workbook is part of the repository.
"""

from __future__ import annotations

import io
import math

import pytest
from openpyxl import Workbook

from app.io.machine_speeds_xlsx import WorkbookError, read_machine_speeds
from app.physics.kinematics import check_operating_points


def _cyclo_rows(n: float = 3000, n2: float = 2800, d: float = 8, d2: float = 9) -> list[list]:
    i = -60 * 2
    motor = 300 / 180
    belt = math.pi * 180 / 2000
    rows = [
        [None, None, None, None],
        ["Machine Type", "Test Sludge", "Test Sludge"],
        ["1. Operating parameters"],
        ["Bowl speed", n, n2, "rpm"],
        ["Differential speed", d, d2, "rpm"],
        ["2. Gearbox and belt data"],
        ["Gearbox Type", "Cyclo - 2 stages", "Cyclo - 2 stages"],
        ["Cyclo 1st stage ratio, K1", -60, -60, "ratio"],
        ["2nd stage ratio, K2", 2, 2, "ratio"],
        ["K1.K2", i, i, "ratio"],
        ["Pulley-Ø motor", 300, 300, "mm"],
        ["Pulley-Ø machine", 180, 180, "mm"],
        ["Belt length", 2000, 2000, "mm"],
        ["Pulley ratio", motor, motor],
        ["3. Exciting speed"],
        ["Bowl speed", n, n2, "rpm"],
        [None, n / 60, n2 / 60, "Hz"],
        ["Main motor speed", n / motor, n2 / motor, "rpm"],
        ["Secondary motor speed, Vs", n - d * 120, n2 - d2 * 120, "rpm"],
        ["Cyclo intermediate shaft speed, Vi", n - 60 * d, n2 - 60 * d2, "rpm"],
        ["Conveyor speed, Vv", n + d, n2 + d2, "rpm"],
        ["Belt frequency", belt * n, belt * n2, "rpm"],
        ["Belt flexing frequency (two pulleys), fb", 2 * belt * n, 2 * belt * n2, "rpm"],
        ["Remarks", "made up for the test"],
    ]
    return rows


def _planetary_rows() -> list[list]:
    n, d = 1700.0, 50.0
    pinion = abs(n - d * 40)
    return [
        ["Machine Type", "Test Planetary"],
        ["1. Operating parameters"],
        ["Bowl speed", n, "rpm"],
        ["Differential speed", d, "rpm"],
        ["2. Gearbox and belt data"],
        ["Gearbox Type", "Planetary"],
        ["1st stage ratio, K1", 40, "ratio"],
        ["2nd stage ratio, K2", 1, "ratio"],
        ["Pulley-Ø motor", 560, "mm"],
        ["Pulley-Ø machine", 470, "mm"],
        ["Belt length", 5400, "mm"],
        ["2nd Motor pulley-Ø motor", 200, "mm"],
        ["2nd Motor pulley-Ø machine", 560, "mm"],
        ["Belt length", 5300, "mm"],
        ["3. Exciting speed"],
        ["Gear pinion speed, Vi", pinion, "rpm"],
        ["Secondary motor speed, Vs", pinion * 560 / 200, "rpm"],
        # As some sheets have it: computed from the bowl speed, not the pinion.
        ["2nd Motor - Belt frequency", math.pi * 560 / 5300 * n, "rpm"],
    ]


def _workbook(sheets: dict[str, list[list]]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)
    for title, rows in sheets.items():
        ws = wb.create_sheet(title)
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_reads_a_cyclo_sheet_into_the_cyclo_template() -> None:
    [imported] = read_machine_speeds(_workbook({"Sludge": _cyclo_rows(), "Notes": [["x"]]}))
    p = imported.profile
    assert imported.sheet == "Sludge"
    assert p.name == "Test Sludge"
    assert p.match_patterns == ["test sludge"]
    values = p.parameter_values()
    assert values | {"f_mains": 50} == {
        "d": 8,
        "K1": -60,
        "K2": 2,
        "D_motor": 300,
        "D_machine": 180,
        "L_belt": 2000,
        "f_mains": 50,
    }
    assert [(o.label, o.bowl_rpm, o.parameters) for o in p.operating_points] == [
        ("3000 rpm", 3000, {}),
        ("2800 rpm", 2800, {"d": 9}),
    ]
    assert imported.warnings == ["'Remarks': no value, ignored"]
    # Every speed of section 3 agrees with the template's formulas.
    for point in check_operating_points(p):
        checked = [c for c in point.components if c.reference_rpm is not None]
        assert len(checked) == 7
        assert all(abs(c.delta_rpm) < 1e-6 for c in checked), point


def test_reads_a_planetary_sheet_and_shows_where_it_disagrees() -> None:
    [imported] = read_machine_speeds(_workbook({"P": _planetary_rows()}))
    p = imported.profile
    keys = [c.key for c in p.components]
    assert "pinion" in keys and "belt2" in keys
    values = p.parameter_values()
    assert (values["D2_motor"], values["D2_machine"], values["L2_belt"]) == (200, 560, 5300)
    assert values["L_belt"] == 5400
    [point] = check_operating_points(p)
    rows = {c.key: c for c in point.components}
    assert rows["pinion"].delta_rpm == pytest.approx(0)
    assert rows["secondary_motor"].delta_rpm == pytest.approx(0)
    # The sheet's back-drive belt runs with the bowl; the template's with the
    # pinion (300 rpm here): the difference is shown, not hidden.
    assert rows["belt2"].delta_rpm == pytest.approx(math.pi * 560 / 5300 * (300 - 1700))


def test_unknown_gearbox_type_falls_back_with_a_warning() -> None:
    rows = [
        r if r and r[0] != "Gearbox Type" else ["Gearbox Type", "Hydraulic"] for r in _cyclo_rows()
    ]
    [imported] = read_machine_speeds(_workbook({"S": rows}))
    assert any("'hydraulic' is not known" in w for w in imported.warnings)
    assert "intermediate_shaft" in [c.key for c in imported.profile.components]


def test_rejects_a_workbook_that_unpacks_too_far() -> None:
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        # 60 MB of zeros compress to about 60 kB.
        archive.writestr("xl/worksheets/sheet1.xml", b"\0" * (60 * 1024 * 1024))
    with pytest.raises(WorkbookError, match="unpacks to more"):
        read_machine_speeds(buf.getvalue())


def test_rejects_what_is_not_a_machine_speeds_workbook() -> None:
    with pytest.raises(WorkbookError, match=r"not an \.xlsx"):
        read_machine_speeds(b"plain text")
    with pytest.raises(WorkbookError, match="no sheet"):
        read_machine_speeds(_workbook({"Other": [["Hello", 1]]}))
