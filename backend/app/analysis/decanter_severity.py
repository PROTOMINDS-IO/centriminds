"""Permissible vibration levels for decanter centrifuges.

ISO 20816-1 / 10816-3 zone tables are explicitly *not* valid for decanter
centrifuges. The limits below are the ANDRITZ set points for new and
refurbished decanters, measured as RMS velocity on the bearing pillow blocks
in the radial (vertical and/or horizontal) direction. They depend on the bowl
diameter:

    bowl diameter   good <   alarm at   shutdown at   FAT new   FAT refurb.
    < 350 mm          8        14          18            5          7
    < 450 mm          8        14          18            5          7
    < 550 mm          8        14          18            5          7
    < 670 mm         10        16          20            6          8
    < 800 mm         12        16          20            6          8
    < 910 mm         14        18          22            7          9
    < 1200 mm        16        20          24            7          9
    > 1200 mm        16        20          24            8         10
    (all mm/s RMS)

Zones: good → usable → still permissible (alarm level reached) → not
permissible (shutdown level reached). Axial vibration must stay below 70 % of
the radial value; the table does not apply to other measuring positions.

The overall velocity of one spectrum is computed from its lines (Parseval):
``v_rms = sqrt(sum(A_i^2))`` for RMS-scaled lines, ``sqrt(sum(A_i^2) / 2)``
for peak-scaled lines, over the evaluation band.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

ZONE_GOOD = "good"
ZONE_USABLE = "usable"
ZONE_ALARM = "alarm"
ZONE_SHUTDOWN = "shutdown"

AMPLITUDE_RMS = "rms"
AMPLITUDE_PEAK = "peak"
ALLOWED_AMPLITUDE_SCALES = {AMPLITUDE_RMS, AMPLITUDE_PEAK}


@dataclass(frozen=True)
class DiameterClass:
    id: str
    label: str
    #: Exclusive upper bound of the bowl diameter; None for the open-ended class.
    max_diameter_mm: float | None
    good_below: float
    alarm_at: float
    shutdown_at: float
    #: Factory acceptance test (FAT) limits for new and refurbished machines.
    fat_new: float
    fat_refurbished: float


DIAMETER_CLASSES: list[DiameterClass] = [
    DiameterClass("lt350", "< 350 mm", 350, 8, 14, 18, 5, 7),
    DiameterClass("lt450", "< 450 mm", 450, 8, 14, 18, 5, 7),
    DiameterClass("lt550", "< 550 mm", 550, 8, 14, 18, 5, 7),
    DiameterClass("lt670", "< 670 mm", 670, 10, 16, 20, 6, 8),
    DiameterClass("lt800", "< 800 mm", 800, 12, 16, 20, 6, 8),
    DiameterClass("lt910", "< 910 mm", 910, 14, 18, 22, 7, 9),
    DiameterClass("lt1200", "< 1200 mm", 1200, 16, 20, 24, 7, 9),
    DiameterClass("gt1200", "> 1200 mm", None, 16, 20, 24, 8, 10),
]

#: Used when the bowl diameter is unknown: the strictest limits.
DEFAULT_CLASS = DIAMETER_CLASSES[0]


def class_for_diameter(diameter_mm: float | None) -> DiameterClass:
    if diameter_mm is None or diameter_mm <= 0:
        return DEFAULT_CLASS
    for c in DIAMETER_CLASSES:
        if c.max_diameter_mm is None or diameter_mm < c.max_diameter_mm:
            return c
    return DIAMETER_CLASSES[-1]


def zone_for(velocity_mm_s: float, c: DiameterClass) -> str:
    if velocity_mm_s < c.good_below:
        return ZONE_GOOD
    if velocity_mm_s < c.alarm_at:
        return ZONE_USABLE
    if velocity_mm_s < c.shutdown_at:
        return ZONE_ALARM
    return ZONE_SHUTDOWN


class NotRatableError(ValueError):
    """The measurement does not cover the rating band (no rating possible)."""

    def __init__(self, band_lo_hz: float, band_hi_hz: float) -> None:
        super().__init__(
            f"The spectra have no lines between {band_lo_hz:g} and {band_hi_hz:g} Hz, "
            "so this measurement cannot be rated against the decanter vibration limits."
        )
        #: The requested band, for clients that word the message themselves.
        self.band_lo_hz = band_lo_hz
        self.band_hi_hz = band_hi_hz


def overall_velocity(
    freq_axis: np.ndarray,
    z_matrix: np.ndarray,
    *,
    band_lo_hz: float,
    band_hi_hz: float,
    amplitude_scale: str = AMPLITUDE_RMS,
) -> np.ndarray:
    """Overall RMS velocity (mm/s) of every block within the band."""
    if amplitude_scale not in ALLOWED_AMPLITUDE_SCALES:
        raise ValueError(f"amplitude_scale must be one of {sorted(ALLOWED_AMPLITUDE_SCALES)}")
    mask = (freq_axis >= band_lo_hz) & (freq_axis <= band_hi_hz)
    if not mask.any():
        raise NotRatableError(band_lo_hz, band_hi_hz)
    energy = (z_matrix[:, mask] ** 2).sum(axis=1)
    if amplitude_scale == AMPLITUDE_PEAK:
        energy = energy / 2.0
    return np.sqrt(energy)


@dataclass(frozen=True)
class DecanterSeverity:
    zone: str
    #: Highest overall velocity at operating speed; this is what gets rated.
    velocity_mm_s: float
    operating_rpm: float
    #: Highest overall velocity anywhere in the speed sweep (incl. transients).
    sweep_max_mm_s: float
    sweep_max_rpm: float
    sweep_max_zone: str
    diameter_class: str
    diameter_class_label: str
    bowl_diameter_mm: float | None
    good_below: float
    alarm_at: float
    shutdown_at: float
    fat_new: float
    fat_refurbished: float
    band_lo_hz: float
    band_hi_hz: float
    amplitude_scale: str
    #: Per-block overall velocity against RPM, for the trend chart.
    trend_rpm: list[float] = field(default_factory=list)
    trend_mm_s: list[float] = field(default_factory=list)


def compute_decanter_severity(
    freq_axis: np.ndarray,
    ref_speeds: np.ndarray,
    z_matrix: np.ndarray,
    *,
    bowl_diameter_mm: float | None = None,
    band_lo_hz: float = 10.0,
    band_hi_hz: float = 1000.0,
    amplitude_scale: str = AMPLITUDE_RMS,
    operating_speed_fraction: float = 0.9,
) -> DecanterSeverity:
    """Rate a speed sweep against the decanter permissible-level table.

    The rating uses the blocks at operating speed (RPM at or above
    ``operating_speed_fraction`` × the sweep maximum), because the set points
    describe steady operation. The sweep maximum is reported alongside so
    resonance crossings during run-up / coast-down stay visible.
    """
    c = class_for_diameter(bowl_diameter_mm)
    # Reported band: what the export actually covers (e.g. 10-400 Hz).
    hi = min(band_hi_hz, float(freq_axis.max())) if freq_axis.size else band_hi_hz
    v = overall_velocity(
        freq_axis,
        z_matrix,
        band_lo_hz=band_lo_hz,
        band_hi_hz=band_hi_hz,
        amplitude_scale=amplitude_scale,
    )
    top_rpm = float(ref_speeds.max())
    operating = ref_speeds >= operating_speed_fraction * top_rpm
    op_idx = np.flatnonzero(operating)
    op_best = int(op_idx[v[op_idx].argmax()])
    sweep_best = int(v.argmax())

    order = np.argsort(ref_speeds, kind="stable")
    return DecanterSeverity(
        zone=zone_for(float(v[op_best]), c),
        velocity_mm_s=float(v[op_best]),
        operating_rpm=float(ref_speeds[op_best]),
        sweep_max_mm_s=float(v[sweep_best]),
        sweep_max_rpm=float(ref_speeds[sweep_best]),
        sweep_max_zone=zone_for(float(v[sweep_best]), c),
        diameter_class=c.id,
        diameter_class_label=c.label,
        bowl_diameter_mm=bowl_diameter_mm,
        good_below=c.good_below,
        alarm_at=c.alarm_at,
        shutdown_at=c.shutdown_at,
        fat_new=c.fat_new,
        fat_refurbished=c.fat_refurbished,
        band_lo_hz=band_lo_hz,
        band_hi_hz=hi,
        amplitude_scale=amplitude_scale,
        trend_rpm=[round(float(x), 1) for x in ref_speeds[order]],
        trend_mm_s=[round(float(x), 3) for x in v[order]],
    )
