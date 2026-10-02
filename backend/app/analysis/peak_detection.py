"""Per-block peak detection on a spectrogram matrix.

Uses scipy.signal.find_peaks with a prominence floor relative to each block's
strongest line, so one setting suits quiet and loud blocks of a sweep alike.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.signal import find_peaks


@dataclass(frozen=True)
class PeakHit:
    """A local-maximum peak within a single spectrogram block."""

    block_idx: int
    rpm: float
    freq_hz: float
    amplitude: float


def detect_peaks(
    freq_axis: np.ndarray,
    ref_speeds: np.ndarray,
    z_matrix: np.ndarray,
    *,
    prominence_ratio: float = 0.05,
    max_peaks_per_block: int = 30,
) -> list[PeakHit]:
    """Find local-maximum peaks in each block of `z_matrix`.

    `prominence_ratio` is multiplied by each block's max amplitude to set the
    minimum prominence, so the threshold follows the block's level: flat or
    all-zero blocks contribute nothing, and a loud block needs a
    proportionally bigger bump than a quiet one. Each block keeps at most
    `max_peaks_per_block` peaks, the highest ones.
    """
    if z_matrix.ndim != 2:
        raise ValueError(f"z_matrix must be 2-D, got shape {z_matrix.shape}")
    n_blocks, n_bins = z_matrix.shape
    if freq_axis.shape != (n_bins,):
        raise ValueError(
            f"freq_axis length {freq_axis.shape} does not match z_matrix bins {n_bins}"
        )
    if ref_speeds.shape != (n_blocks,):
        raise ValueError(
            f"ref_speeds length {ref_speeds.shape} does not match z_matrix blocks {n_blocks}"
        )

    out: list[PeakHit] = []
    for b in range(n_blocks):
        spectrum = z_matrix[b]
        max_amp = float(spectrum.max()) if spectrum.size else 0.0
        if max_amp <= 0.0:
            continue
        prominence = max_amp * prominence_ratio
        idxs, _ = find_peaks(spectrum, prominence=prominence)
        if len(idxs) == 0:
            continue
        amplitudes = spectrum[idxs]
        order = np.argsort(amplitudes)[::-1][:max_peaks_per_block]
        for j in idxs[order]:
            out.append(
                PeakHit(
                    block_idx=int(b),
                    rpm=float(ref_speeds[b]),
                    freq_hz=float(freq_axis[j]),
                    amplitude=float(spectrum[j]),
                )
            )
    return out
