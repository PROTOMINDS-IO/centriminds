"""Unit tests for the .odx parser.

Synthetic fixtures cover the happy path and error cases. The real-file test
runs on every `.odx` export in ODX_SAMPLE_DIR (customer data, not in the
repository); without it, CI included, it is skipped.
"""

from __future__ import annotations

import os
from pathlib import Path
from textwrap import dedent

import numpy as np
import pytest

from app.io.odx_parser import OdxParseError, parse_odx


def _synthetic(n_blocks: int = 2, bins: int = 8, increment: float = 0.5) -> str:
    header = dedent(
        """\
        #Condition Monitoring - Omnitrend Data Exchange
        250
        #Date of Export
        Wed Apr 22 09:39:38 2026
        #Path
        test\\synthetic
        """
    )
    x_end = (bins - 1) * increment
    blocks = []
    for b in range(n_blocks):
        ys = " ".join(f"{0.01 * (b + 1) * (k + 1):.6f}" for k in range(bins))
        blocks.append(
            dedent(
                f"""\
                #Date
                {1700000000 + b}=Human readable block {b}
                #Channel
                0
                #X-Start,Increment,X-End
                0.000000 {increment:.6f} {x_end:.6f}
                #Y-Count
                {bins}, deadbeef
                #Y-Values
                {ys}
                #RefSpeed
                {100.0 + 10 * b}
                #RefLoad
                {50.0 + b}
                """
            )
        )
    return header + "".join(blocks)


def test_parse_synthetic_two_blocks() -> None:
    text = _synthetic(n_blocks=2, bins=8, increment=0.5)
    result = parse_odx(text)

    assert len(result.ref_speeds) == 2
    assert len(result.y_matrix) == 2
    assert result.ref_speeds == [100.0, 110.0]
    assert result.ref_loads == [50.0, 51.0]
    assert result.dates_unix == [1700000000, 1700000001]
    assert result.freq_axis == [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5]

    freq, _speeds, matrix, _loads = result.as_numpy()
    assert freq.shape == (8,)
    assert matrix.shape == (2, 8)
    assert np.allclose(matrix[0], [0.01 * (k + 1) for k in range(8)])
    assert np.allclose(matrix[1], [0.02 * (k + 1) for k in range(8)])


def test_parse_raises_on_wrong_y_count() -> None:
    text = _synthetic(n_blocks=1, bins=8)
    bad = text.replace(
        "#Y-Count\n8, deadbeef",
        "#Y-Count\n9, deadbeef",
    )
    with pytest.raises(OdxParseError, match=r"count mismatch"):
        parse_odx(bad)


def test_parse_raises_on_axis_drift() -> None:
    block_a = dedent(
        """\
        #Date
        1=a
        #Channel
        0
        #X-Start,Increment,X-End
        0.000000 0.500000 1.500000
        #Y-Count
        4, x
        #Y-Values
        0.1 0.2 0.3 0.4
        #RefSpeed
        100
        #RefLoad
        0
        """
    )
    block_b = dedent(
        """\
        #Date
        2=b
        #Channel
        0
        #X-Start,Increment,X-End
        0.000000 0.250000 0.750000
        #Y-Count
        4, x
        #Y-Values
        0.1 0.2 0.3 0.4
        #RefSpeed
        110
        #RefLoad
        0
        """
    )
    with pytest.raises(OdxParseError, match=r"axis drift"):
        parse_odx(block_a + block_b)


def test_parse_raises_on_no_blocks() -> None:
    with pytest.raises(OdxParseError, match=r"No complete measurement blocks"):
        parse_odx("#Just a header\nnothing useful\n")


def test_parse_raises_on_bad_y_token() -> None:
    text = _synthetic(n_blocks=1, bins=4).replace(
        "0.010000 0.020000 0.030000 0.040000",
        "0.010000 NaNburger 0.030000 0.040000",
    )
    with pytest.raises(OdxParseError, match=r"Y-Values: bad token"):
        parse_odx(text)


def test_parse_rejects_non_finite_values() -> None:
    text = _synthetic(n_blocks=1, bins=4).replace(
        "0.010000 0.020000 0.030000 0.040000",
        "0.010000 nan 0.030000 inf",
    )
    with pytest.raises(OdxParseError, match=r"non-finite"):
        parse_odx(text)
    with pytest.raises(OdxParseError, match=r"finite number"):
        parse_odx(_synthetic(n_blocks=1).replace("#RefSpeed\n100.0", "#RefSpeed\nnan"))


@pytest.mark.parametrize(
    "axis", ["0 0.000001 1000000", "0 1e-300 1", "10 1 5", "-1e308 1e-308 1e308"]
)
def test_parse_rejects_axis_without_sane_line_count(axis: str) -> None:
    # Guards against an upload of under 100 bytes whose axis declares an absurd
    # number of lines (or none): building that axis would take the API down,
    # so the parser rejects it before allocating anything.
    text = (
        f"#X-Start,Increment,X-End\n{axis}\n#Y-Count\n1\n#Y-Values\n1\n#RefSpeed\n1\n#RefLoad\n1\n"
    )
    with pytest.raises(OdxParseError, match=r"spectrum lines"):
        parse_odx(text)


def test_parse_content_hash_stable() -> None:
    text = _synthetic(n_blocks=1, bins=4)
    a = parse_odx(text)
    b = parse_odx(text)
    assert a.content_sha256 == b.content_sha256
    assert len(a.content_sha256) == 64


# ---- real-sample tests (skipped without ODX_SAMPLE_DIR) ------------------

_SAMPLE_DIR = os.environ.get("ODX_SAMPLE_DIR")
_SAMPLES = sorted(Path(_SAMPLE_DIR).rglob("*.odx")) if _SAMPLE_DIR else []


@pytest.mark.skipif(not _SAMPLES, reason="no sample exports; set ODX_SAMPLE_DIR to their folder")
@pytest.mark.parametrize("sample", _SAMPLES, ids=lambda p: p.name)
def test_real_export(sample: Path) -> None:
    result = parse_odx(sample)
    freq, speeds, matrix, loads = result.as_numpy()
    n = len(result.ref_speeds)
    assert n >= 1
    assert matrix.shape == (n, freq.size)
    assert loads.shape == speeds.shape == (n,)
    assert len(result.dates_unix) == len(result.dates_human) == n
    steps = np.diff(freq)
    assert freq[0] >= 0
    assert (steps > 0).all() and np.allclose(steps, steps[:1])  # one linear axis
    assert np.isfinite(matrix).all() and (matrix >= 0).all()
    assert speeds.max() > 0
