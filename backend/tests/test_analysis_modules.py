"""Unit tests for the analysis modules: peaks, attribution, order lines and
tracking, resonance zones, speed-independent lines, severity, the
spectrogram downsampling and the pipeline's parameters."""

from __future__ import annotations

from itertools import pairwise

import numpy as np
import pytest

from app.analysis.attribution import attribute_peaks
from app.analysis.decanter_severity import (
    NotRatableError,
    class_for_diameter,
    compute_decanter_severity,
    overall_velocity,
    zone_for,
)
from app.analysis.orders import build_order_lines, find_resonance_zones, track_lines
from app.analysis.peak_detection import PeakHit, detect_peaks
from app.analysis.pipeline import DEFAULT_PHYSICS_PARAMS
from app.analysis.spectrogram import SpectrumArrays, maxpool_axis1, stride_indices
from app.analysis.stationary import find_stationary_lines
from app.physics.kinematics import Machine, compile_machine
from app.physics.profile import MachineProfileData
from app.schemas import AnalysisParams
from tests.conftest import decanter_document


def _build_block(
    n_bins: int, peak_bin: int, peak_amp: float = 1.0, noise: float = 0.01
) -> np.ndarray:
    spectrum = np.full(n_bins, noise, dtype=np.float64)
    spectrum[peak_bin] = peak_amp
    return spectrum


def test_detect_peaks_finds_isolated_peak() -> None:
    n_bins = 100
    increment = 0.5
    freq_axis = np.arange(n_bins) * increment
    z = np.array([_build_block(n_bins, peak_bin=40)])
    speeds = np.array([1500.0])

    hits = detect_peaks(freq_axis, speeds, z)
    assert len(hits) == 1
    assert hits[0] == PeakHit(block_idx=0, rpm=1500.0, freq_hz=20.0, amplitude=1.0)


def test_detect_peaks_skips_silent_blocks() -> None:
    freq_axis = np.arange(50) * 0.5
    z = np.zeros((1, 50))
    speeds = np.array([1000.0])
    assert detect_peaks(freq_axis, speeds, z) == []


def test_detect_peaks_respects_max_per_block() -> None:
    n_bins = 100
    z = np.full((1, n_bins), 0.01)
    # Inject 5 peaks, descending in amplitude.
    for i, bin_idx in enumerate([10, 30, 50, 70, 90]):
        z[0, bin_idx] = 1.0 - 0.1 * i
    freq_axis = np.arange(n_bins) * 0.5
    speeds = np.array([1500.0])

    hits = detect_peaks(freq_axis, speeds, z, max_peaks_per_block=3)
    assert len(hits) == 3
    # Top 3 by amplitude → peaks at bins 10, 30, 50.
    amps = sorted(h.amplitude for h in hits)
    assert amps == pytest.approx([0.8, 0.9, 1.0])


def _decanter() -> Machine:
    return compile_machine(MachineProfileData.model_validate(decanter_document()))


def test_attribute_peaks_matches_bowl_at_3000_rpm() -> None:
    peak = PeakHit(block_idx=0, rpm=3000.0, freq_hz=50.0, amplitude=1.0)
    attributed = attribute_peaks([peak], _decanter(), tolerance_hz=0.5)
    assert len(attributed) == 1
    a = attributed[0]
    assert a.source_id == "bowl"
    assert a.harmonic == 1
    assert a.expected_freq_hz == pytest.approx(50.0)
    assert a.delta_hz == pytest.approx(0.0)
    assert a.confidence == pytest.approx(1.0)


def test_attribute_peaks_unattributed_when_outside_tolerance() -> None:
    peak = PeakHit(block_idx=0, rpm=3000.0, freq_hz=999.99, amplitude=1.0)
    attributed = attribute_peaks([peak], _decanter(), tolerance_hz=0.5)
    assert len(attributed) == 1
    a = attributed[0]
    assert a.source_id is None
    assert a.harmonic == 0
    assert a.confidence == 0.0


def test_attribute_peaks_confidence_decays_with_delta() -> None:
    # At 3000 rpm the bowl's 7th order is 350.0 Hz and the scroll's
    # (3010 rpm) 351.17 Hz: a peak 0.25 Hz past the bowl's is half the
    # 0.5 Hz tolerance away → confidence 0.5.
    peak = PeakHit(block_idx=0, rpm=3000.0, freq_hz=350.25, amplitude=1.0)
    attributed = attribute_peaks([peak], _decanter(), tolerance_hz=0.5)
    assert attributed[0].source_id == "bowl"
    assert attributed[0].harmonic == 7
    assert attributed[0].confidence == pytest.approx(0.5, abs=1e-6)


def _bowl_and_mains() -> Machine:
    return compile_machine(
        MachineProfileData.model_validate(
            {
                "name": "Bowl and mains",
                "parameters": [{"key": "f_mains", "label": "Mains", "value": 50}],
                "components": [
                    {"key": "bowl", "label": "Bowl", "speed_rpm": "n", "max_order": 3},
                    {
                        "key": "mains",
                        "label": "Mains",
                        "kind": "electrical",
                        "speed_rpm": "60 * f_mains",
                        "max_order": 2,
                    },
                ],
                "structural_modes": [{"name": "Test mode", "freq_hz": 40}],
            }
        )
    )


def _resonant_sweep(fn: float = 40.0, zeta: float = 0.05) -> SpectrumArrays:
    """A coast-down whose bowl orders 1–3 pass a natural frequency `fn` (a
    single-degree-of-freedom gain), over a 50 Hz mains line and noise."""
    rng = np.random.default_rng(7)
    freq = np.arange(0, 200.5, 0.5)
    speeds = np.linspace(3000, 300, 120)
    z = rng.uniform(0.002, 0.006, size=(speeds.size, freq.size))
    for b, rpm in enumerate(speeds):
        for k, base in ((1, 1.0), (2, 0.4), (3, 0.25)):
            f = k * rpm / 60
            r = f / fn
            gain = 1 / np.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2)
            j = round(f / 0.5)
            if j < freq.size:
                z[b, j] += base * 0.2 * gain
    z[:, 100] += 0.08  # 50 Hz, whatever the speed
    return SpectrumArrays(
        freq_axis=freq,
        ref_speeds=speeds,
        ref_loads=np.zeros(speeds.size),
        z_matrix=z,
        dates_unix=np.zeros(speeds.size, dtype=np.int64),
        dates_human=np.array([""] * speeds.size),
    )


def test_order_lines_merge_what_the_resolution_cannot_separate() -> None:
    machine = _decanter()
    lines = build_order_lines(machine, 300, 3000, 200, 0.5)
    ids = {ln.id for ln in lines}
    # Bowl and scroll differ by d = 10 rpm: 0.17 Hz per order, under the
    # 4 lines × 0.5 Hz = 2 Hz main lobe up to order 11 — one line each.
    assert "bowl@1+scroll@1" in ids
    assert "bowl@3+scroll@3" in ids
    # Belt flex is twice the belt: the same line as the belt's 2nd order
    # (and here also within 2 Hz of the main motor's 1st).
    assert any("belt@2+belt_flex@1" in i for i in ids)
    mains = [ln for ln in lines if ln.kind == "electrical"]
    assert {m.id for m in mains} == {"mains@1", "mains@2", "mains@3"}
    assert all(set(m.freq_hz) == {50.0 * m.members[0].order} for m in mains)


def test_order_lines_keep_the_kink_where_a_direction_flips() -> None:
    # The secondary motor turns at n - 1200 rpm here: |f| is V-shaped with
    # its tip at 1200 rpm, which must be a sample.
    lines = build_order_lines(_decanter(), 300, 3000, 200, 0.5)
    vs = next(ln for ln in lines if ln.members[0].component == "secondary_motor")
    tip = vs.freq_hz.index(min(vs.freq_hz))
    assert vs.rpm[tip] == pytest.approx(1200, abs=0.01)
    assert vs.freq_hz[tip] == pytest.approx(0, abs=1e-6)


def test_order_lines_drop_what_lies_above_the_spectrum() -> None:
    lines = build_order_lines(_bowl_and_mains(), 300, 3000, 40, 0.5)
    # Bowl 1× reaches 5–50 Hz; its 3rd order starts at 15 Hz; mains at 50 Hz is out.
    assert {ln.id for ln in lines} == {"bowl@1", "bowl@2", "bowl@3"}


def test_tracking_and_zones_find_the_natural_frequency() -> None:
    spec = _resonant_sweep(fn=40.0)
    machine = _bowl_and_mains()
    lines = build_order_lines(machine, 300, 3000, 200, 0.5)
    track_lines(lines, machine, spec, window_hz=0.5)
    bowl1 = next(ln for ln in lines if ln.id == "bowl@1")
    # Bowl 1× is 40 Hz at 2400 rpm, where its track peaks.
    assert bowl1.peak_rpm == pytest.approx(2400, abs=40)
    assert bowl1.peak_freq_hz == pytest.approx(40, abs=0.7)

    stationary = find_stationary_lines(spec, machine, tolerance_hz=0.5)
    zones = find_resonance_zones(
        lines, machine, spec, stationary_hz=[s.freq_hz for s in stationary], window_hz=0.5
    )
    assert len(zones) == 1, zones
    zone = zones[0]
    assert zone.lo_hz < 40 < zone.hi_hz
    assert zone.center_hz == pytest.approx(40, abs=1.5)
    assert {e.line_id for e in zone.evidence} == {"bowl@1", "bowl@2", "bowl@3"}
    assert zone.confidence == 1.0
    assert zone.relative_amplitude == pytest.approx(1.0)
    assert zone.modes == ["Test mode"]


def test_stationary_lines_find_and_classify_the_mains() -> None:
    spec = _resonant_sweep()
    lines = find_stationary_lines(spec, _bowl_and_mains(), tolerance_hz=0.5)
    assert len(lines) == 1
    mains = lines[0]
    assert mains.freq_hz == 50.0
    assert mains.kind == "electrical"
    assert (mains.source, mains.order) == ("mains", 1)
    assert mains.presence == 1.0
    assert mains.contrast > 10


def test_stationary_lines_ignore_a_sweep_dwelling_at_one_speed() -> None:
    # Half of the spectra at the top speed: its bowl 1× is lit in most
    # spectra, but in one speed range only, so it is not speed-independent.
    freq = np.arange(0, 100.5, 0.5)
    speeds = np.concatenate([np.full(60, 3000.0), np.linspace(2900, 300, 60)])
    z = np.full((speeds.size, freq.size), 0.004)
    for b, rpm in enumerate(speeds):
        z[b, round(rpm / 60 / 0.5)] = 1.0
    spec = SpectrumArrays(
        freq, speeds, np.zeros(120), z, np.zeros(120, dtype=np.int64), np.array([""] * 120)
    )
    assert find_stationary_lines(spec, _bowl_and_mains(), tolerance_hz=0.5) == []


def test_stationary_lines_name_a_known_structural_mode() -> None:
    freq = np.arange(0, 100.5, 0.5)
    speeds = np.linspace(3000, 300, 50)
    z = np.full((50, freq.size), 0.004)
    z[:, 80] = 0.3  # 40 Hz: the profile's "Test mode"
    spec = SpectrumArrays(
        freq, speeds, np.zeros(50), z, np.zeros(50, dtype=np.int64), np.array([""] * 50)
    )
    [line] = find_stationary_lines(spec, _bowl_and_mains(), tolerance_hz=0.5)
    assert (line.kind, line.source) == ("structural", "Test mode")


def test_overall_velocity_is_parseval_sum() -> None:
    freq = np.linspace(0, 100, 201)
    z = np.zeros((2, 201))
    z[0, 40] = 3.0  # 20 Hz
    z[0, 80] = 4.0  # 40 Hz
    v = overall_velocity(freq, z, band_lo_hz=10, band_hi_hz=1000)
    assert v[0] == pytest.approx(5.0)
    assert v[1] == 0.0
    peak = overall_velocity(freq, z, band_lo_hz=10, band_hi_hz=1000, amplitude_scale="peak")
    assert peak[0] == pytest.approx(5.0 / np.sqrt(2))


def test_overall_velocity_rejects_unknown_scale() -> None:
    with pytest.raises(ValueError):
        overall_velocity(
            np.array([20.0]), np.array([[1.0]]), band_lo_hz=10, band_hi_hz=100, amplitude_scale="dB"
        )


def test_overall_velocity_refuses_spectra_outside_the_band() -> None:
    # A 0-5 Hz export has nothing to rate; it must not come out as "good".
    freq = np.linspace(0.0, 5.0, 11)
    with pytest.raises(NotRatableError, match="between 10 and 1000 Hz"):
        overall_velocity(freq, np.ones((2, 11)), band_lo_hz=10, band_hi_hz=1000)


@pytest.mark.parametrize(
    "diameter,expected",
    [
        (None, "lt350"),
        (300, "lt350"),
        (450, "lt550"),
        (549, "lt550"),
        (600, "lt670"),
        (799, "lt800"),
        (900, "lt910"),
        (1199, "lt1200"),
        (1500, "gt1200"),
    ],
)
def test_class_for_diameter(diameter, expected) -> None:
    assert class_for_diameter(diameter).id == expected


def test_largest_class_is_open_ended() -> None:
    c = class_for_diameter(1500)
    assert c.max_diameter_mm is None
    assert (c.alarm_at, c.shutdown_at) == (20, 24)


def test_zone_boundaries_small_bowl() -> None:
    c = class_for_diameter(400)
    assert [zone_for(v, c) for v in (7.9, 8.0, 13.9, 14.0, 17.9, 18.0)] == [
        "good",
        "usable",
        "usable",
        "alarm",
        "alarm",
        "shutdown",
    ]


def test_severity_rates_operating_speed_not_transient() -> None:
    freq = np.linspace(0, 100, 201)
    speeds = np.array([3000.0, 2950.0, 800.0, 100.0])
    z = np.zeros((4, 201))
    z[0, 100] = 6.0  # 50 Hz at operating speed → good (< 8)
    z[1, 100] = 5.0
    z[2, 30] = 20.0  # 15 Hz resonance crossing during coast-down
    sev = compute_decanter_severity(freq, speeds, z, bowl_diameter_mm=500)
    assert sev.zone == "good"
    assert sev.velocity_mm_s == pytest.approx(6.0)
    assert sev.operating_rpm == 3000.0
    assert sev.sweep_max_mm_s == pytest.approx(20.0)
    assert sev.sweep_max_rpm == 800.0
    assert sev.sweep_max_zone == "shutdown"
    # Trend is sorted by RPM for plotting.
    assert sev.trend_rpm == sorted(sev.trend_rpm)


def test_severity_uses_diameter_class_limits() -> None:
    freq = np.linspace(0, 100, 201)
    speeds = np.array([3000.0])
    z = np.zeros((1, 201))
    z[0, 100] = 15.0
    assert compute_decanter_severity(freq, speeds, z, bowl_diameter_mm=400).zone == "alarm"
    assert compute_decanter_severity(freq, speeds, z, bowl_diameter_mm=1000).zone == "good"


def test_auto_annotations_mark_zones_and_stationary_lines() -> None:
    from app.analysis.pipeline import _build_auto_annotations

    physics = {
        "machine": {"components": [{"key": "bowl", "label": "Bowl"}]},
        "peaks": [
            {
                "source_id": "bowl",
                "harmonic": 1,
                "freq_hz": 50.0,
                "rpm": 3000.0,
                "amplitude": 1.0,
                "confidence": 1.0,
                "expected_freq_hz": 50.0,
                "delta_hz": 0.0,
                "block_idx": 4,
            }
        ],
        "resonance_zones": [
            {
                "lo_hz": 62.0,
                "hi_hz": 78.0,
                "center_hz": 71.0,
                "confidence": 0.9,
                "peak_amplitude": 2.2,
                "evidence": [{"line_id": "bowl@3"}],
            }
        ],
        "stationary_lines": [
            {
                "freq_hz": 50.0,
                "median_amp": 0.05,
                "presence": 1.0,
                "kind": "electrical",
                "source": "mains",
                "contrast": 4.0,
            }
        ],
    }
    peak, zone, line = _build_auto_annotations(1, physics)
    assert peak.label == "Bowl 1×"
    assert (zone.annotation_type, zone.freq_hz, zone.freq_hz_end) == ("band", 62.0, 78.0)
    assert zone.label == "Possible resonance 62–78 Hz"
    assert (line.annotation_type, line.freq_hz) == ("stationary_line", 50.0)


def test_every_pipeline_parameter_can_be_overridden() -> None:
    assert set(DEFAULT_PHYSICS_PARAMS) == set(AnalysisParams.model_fields)


def _maxpool_loop(matrix: np.ndarray, axis: np.ndarray, max_bins: int):
    """The bucket-by-bucket max-pool `maxpool_axis1` replaced."""
    edges = np.linspace(0, matrix.shape[1], max_bins + 1).round().astype(int)
    pooled = np.stack([matrix[:, a:b].max(axis=1) for a, b in pairwise(edges)], axis=1)
    return pooled, np.array([axis[a:b].mean() for a, b in pairwise(edges)])


@pytest.mark.parametrize(("n_bins", "max_bins"), [(37, 5), (64, 63), (100, 7), (8, 8), (5, 9)])
def test_maxpool_keeps_each_buckets_peak(n_bins: int, max_bins: int) -> None:
    rng = np.random.default_rng(n_bins)
    matrix = rng.random((4, n_bins))
    axis = np.arange(n_bins) * 0.125
    pooled, pooled_axis = maxpool_axis1(matrix, axis, max_bins)
    expected, expected_axis = _maxpool_loop(matrix, axis, min(max_bins, n_bins))
    assert pooled.shape == (4, min(max_bins, n_bins))
    assert np.array_equal(pooled, expected)
    assert np.allclose(pooled_axis, expected_axis)


def test_stride_indices_cover_both_ends() -> None:
    assert stride_indices(5, 10).tolist() == [0, 1, 2, 3, 4]
    assert stride_indices(10, 4).tolist() == [0, 3, 6, 9]
