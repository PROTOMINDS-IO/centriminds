"""Speed-independent lines: frequencies that stay lit whatever the speed.

Excitation follows the speed; what does not is the mains (and its
multiples), structure excited all the time, or a neighbouring machine. A
frequency line's level "whatever the speed" is its median over the sweep,
balanced by speed (`speed_balanced_median`: a sweep that dwells at its top
speed would otherwise make that speed's orders look stationary). A line is
speed-independent where that level stands clearly above the spectrum
around it (`min_contrast` × the local median across frequency) through
most of the speed range. Counting peaks instead would flag noise: every
spectrum has a local maximum somewhere near any frequency.

Each line is then classified: within the matching tolerance of an electrical
component's order (the profile's mains) → electrical; of a structural mode
the profile knows → structural; otherwise unexplained (a structural
resonance or an outside source, for the engineer to judge).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.ndimage import median_filter

from ..physics.kinematics import Machine
from .spectrogram import SpectrumArrays

KIND_ELECTRICAL = "electrical"
KIND_STRUCTURAL = "structural"
KIND_UNEXPLAINED = "unexplained"


#: Speed ranges a sweep is split into for the speed-balanced median.
SPEED_BANDS = 10


def speed_bands(speeds: np.ndarray) -> list[np.ndarray]:
    """Indices of the spectra in each of SPEED_BANDS equal speed ranges (the
    empty ones left out)."""
    lo, hi = float(speeds.min()), float(speeds.max())
    if hi - lo < 1e-6:
        return [np.arange(speeds.size)]
    edges = np.linspace(lo, hi, SPEED_BANDS + 1)
    which = np.clip(np.searchsorted(edges, speeds, side="right") - 1, 0, SPEED_BANDS - 1)
    return [idx for b in range(SPEED_BANDS) if (idx := np.flatnonzero(which == b)).size]


def speed_balanced_median(z: np.ndarray, speeds: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Each frequency line's median over the speed ranges' medians, and those
    medians (one row per speed range)."""
    band_medians = np.stack([np.median(z[idx], axis=0) for idx in speed_bands(speeds)])
    return np.median(band_medians, axis=0), band_medians


@dataclass(frozen=True)
class StationaryLine:
    freq_hz: float
    #: Width of the run of lit frequency lines (Hz).
    width_hz: float
    #: Median amplitude over the sweep, and the highest seen (mm/s).
    median_amp: float
    max_amp: float
    #: Median amplitude / the spectrum's local level around it.
    contrast: float
    #: Share of the speed ranges in which the line stands above twice the
    #: local level.
    presence: float
    kind: str
    #: The component (electrical) or structural mode it was matched to.
    source: str | None
    order: int | None


def find_stationary_lines(
    spec: SpectrumArrays,
    machine: Machine,
    *,
    tolerance_hz: float,
    min_contrast: float = 3.0,
    min_freq_hz: float = 5.0,
    min_presence: float = 0.6,
    max_lines: int = 12,
) -> list[StationaryLine]:
    z, freq = spec.z_matrix, spec.freq_axis
    if z.shape[0] < 3 or freq.size < 9:
        return []
    median, band_medians = speed_balanced_median(z, spec.ref_speeds)
    # The local level: a running median across ~3 % of the axis (≥ 9 lines),
    # wide enough that a line does not raise its own surroundings.
    span = max(9, (freq.size // 32) | 1)
    local = np.maximum(median_filter(median, size=span, mode="nearest"), 1e-9)
    contrast = median / local
    lit = (contrast >= min_contrast) & (freq >= min_freq_hz)

    step = float(freq[1] - freq[0])
    f1 = machine.frequencies_hz(float(np.median(spec.ref_speeds)))
    electrical = [
        (c.key, k, f1[c.key] * k)
        for c in machine.components
        if not machine.is_mechanical(c.key)
        for k in range(1, c.max_order + 1)
    ]
    modes = [(m.name, m.freq_hz) for m in machine.profile.structural_modes]

    out: list[StationaryLine] = []
    i = 0
    while i < freq.size:
        if not lit[i]:
            i += 1
            continue
        j = i
        while j + 1 < freq.size and lit[j + 1]:
            j += 1
        run = slice(i, j + 1)
        top = i + int(np.argmax(median[run]))
        f0 = float(freq[top])
        presence = float((band_medians[:, top] > 2 * local[top]).mean())
        if presence < min_presence:
            i = j + 1
            continue
        kind, source, order = KIND_UNEXPLAINED, None, None
        tol = max(tolerance_hz, 1.5 * step)
        match = min(electrical, key=lambda e: abs(e[2] - f0), default=None)
        if match and abs(match[2] - f0) <= tol:
            kind, source, order = KIND_ELECTRICAL, match[0], match[1]
        else:
            mode = min(modes, key=lambda m: abs(m[1] - f0), default=None)
            if mode and abs(mode[1] - f0) <= max(tol, 0.05 * mode[1]):
                kind, source = KIND_STRUCTURAL, mode[0]
        out.append(
            StationaryLine(
                freq_hz=round(f0, 4),
                width_hz=round(float(freq[j] - freq[i]) + step, 4),
                median_amp=float(median[top]),
                max_amp=float(z[:, top].max()),
                contrast=round(float(contrast[top]), 2),
                presence=round(presence, 3),
                kind=kind,
                source=source,
                order=order,
            )
        )
        i = j + 1
    out.sort(key=lambda s: -s.median_amp)
    return sorted(out[:max_lines], key=lambda s: s.freq_hz)
