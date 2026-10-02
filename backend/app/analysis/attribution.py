"""Match detected peaks to the orders of a machine profile's components.

For each peak, the expected frequency of every component order at that
block's speed is computed and the closest match within `tolerance_hz` wins.
Peaks beyond the tolerance window are returned as unattributed
(source_id=None) rather than dropped, so they stay visible to the user: the
web app's peak table lists them as "Unattributed".
"""

from __future__ import annotations

from dataclasses import dataclass

from ..physics.kinematics import Machine
from .peak_detection import PeakHit


@dataclass(frozen=True)
class AttributedPeak:
    block_idx: int
    rpm: float
    freq_hz: float
    amplitude: float
    source_id: str | None  # a component key
    harmonic: int  # the order; 0 if unattributed
    expected_freq_hz: float | None
    delta_hz: float | None
    confidence: float  # 0..1; 1 means exact match, 0 means at/over tolerance


def _flatten_excitations(
    machine: Machine, rpm: float, max_harmonic: int
) -> list[tuple[str, int, float]]:
    """All (component, order, freq_hz) at this speed."""
    return [(e.source_id, e.order, e.freq_hz) for e in machine.excitations(rpm, max_harmonic)]


def attribute_peaks(
    peaks: list[PeakHit],
    machine: Machine,
    *,
    tolerance_hz: float = 0.5,
    max_harmonic: int = 10,
) -> list[AttributedPeak]:
    """Attribute each peak to its nearest excitation source within tolerance.

    Confidence is `1 - delta_hz / tolerance_hz`, clamped to [0, 1]. Peaks
    further than `tolerance_hz` from any source are returned with
    `source_id=None`, `harmonic=0`, and `confidence=0.0`.
    """
    if tolerance_hz <= 0:
        raise ValueError("tolerance_hz must be positive")
    cache: dict[float, list[tuple[str, int, float]]] = {}
    out: list[AttributedPeak] = []
    for peak in peaks:
        candidates = cache.get(peak.rpm)
        if candidates is None:
            candidates = _flatten_excitations(machine, peak.rpm, max_harmonic)
            cache[peak.rpm] = candidates
        best_src: str | None = None
        best_h = 0
        best_freq = 0.0
        best_delta = float("inf")
        for src, h, freq in candidates:
            delta = abs(peak.freq_hz - freq)
            if delta < best_delta:
                best_delta = delta
                best_src = src
                best_h = h
                best_freq = freq
        if best_src is None or best_delta > tolerance_hz:
            out.append(
                AttributedPeak(
                    block_idx=peak.block_idx,
                    rpm=peak.rpm,
                    freq_hz=peak.freq_hz,
                    amplitude=peak.amplitude,
                    source_id=None,
                    harmonic=0,
                    expected_freq_hz=None,
                    delta_hz=None,
                    confidence=0.0,
                )
            )
            continue
        confidence = max(0.0, 1.0 - best_delta / tolerance_hz)
        out.append(
            AttributedPeak(
                block_idx=peak.block_idx,
                rpm=peak.rpm,
                freq_hz=peak.freq_hz,
                amplitude=peak.amplitude,
                source_id=best_src,
                harmonic=best_h,
                expected_freq_hz=best_freq,
                delta_hz=best_delta,
                confidence=confidence,
            )
        )
    return out
