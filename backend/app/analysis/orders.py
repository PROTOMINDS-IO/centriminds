"""Order lines, order tracking and resonance zones of a speed sweep.

An **order line** is where one order of one component lies at every speed of
the sweep: k × |speed| / 60 Hz. In a waterfall these are the rays from the
origin a vibration engineer draws by hand ("Bowl 1×", "Scroll 3×"). Lines
the measurement cannot tell apart — closer than a Hann window's main lobe
(4 frequency lines) at two speeds of the sweep — are drawn as one, e.g.
"Bowl + Scroll 1×" when the differential speed is small.

**Order tracking** reads the amplitude along each mechanical line, spectrum
by spectrum: the highest frequency line within the matching window.

A **resonance zone** is a frequency range where tracked lines swell as they
pass through it: a natural frequency amplifying whatever crosses it. A bump
on one line can be chance; bumps on several independent lines at the same
frequency are the signature. Readings taken where a line crosses another,
or a speed-independent line (the mains), are not the line's own and are
left out. Each zone carries the lines that support it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.ndimage import median_filter
from scipy.signal import find_peaks

from ..physics.kinematics import Machine
from .spectrogram import SpectrumArrays

#: Lines closer than this many frequency lines are one line (Hann main lobe).
COINCIDENT_LINES = 4
#: Polyline samples across the sweep's speed range.
LINE_SAMPLES = 64
#: A resonance zone spans at most ±10 % around a bump (a damping ratio of
#: 5 % gives a half-power bandwidth of ±5 %; zones gather several orders).
ZONE_HALF_WIDTH = 0.1


@dataclass(frozen=True)
class LineMember:
    component: str
    order: int


@dataclass
class OrderLine:
    id: str
    #: The component orders drawn as this line (coincident ones merged).
    members: list[LineMember]
    #: "mechanical" or "electrical".
    kind: str
    rpm: list[float]
    freq_hz: list[float]
    #: Amplitude along the line at each measured speed (mechanical lines),
    #: for the zone search; a stored run keeps only its peak.
    track_rpm: list[float] = field(default_factory=list)
    track_amp: list[float] = field(default_factory=list)
    peak_amp: float = 0.0
    peak_rpm: float = 0.0
    peak_freq_hz: float = 0.0


@dataclass(frozen=True)
class ZoneEvidence:
    line_id: str
    freq_hz: float
    rpm: float
    amplitude: float
    #: Height of the bump over its surroundings (dB).
    prominence_db: float


@dataclass
class ResonanceZone:
    lo_hz: float
    hi_hz: float
    center_hz: float
    #: 0…1, how sure it is a resonance: grows with the number of
    #: independent lines and the height of their bumps.
    confidence: float
    peak_amplitude: float
    #: peak_amplitude / the strongest counted line's peak: how much it matters.
    relative_amplitude: float
    evidence: list[ZoneEvidence]
    #: Structural modes of the profile inside the zone.
    modes: list[str] = field(default_factory=list)


def _line_freqs(machine: Machine, rpms: np.ndarray) -> dict[str, np.ndarray]:
    """Signed order-1 frequency (Hz) of every component at each speed.

    The formulas are evaluated once per distinct speed: a sweep dwells at
    its top speed, and evaluating them is the slow part of the analysis.
    """
    unique, inverse = np.unique(np.asarray(rpms, dtype=float), return_inverse=True)
    out = {c.key: np.empty(len(unique)) for c in machine.components}
    for i, rpm in enumerate(unique):
        for key, speed in machine.speeds_rpm(float(rpm)).items():
            out[key][i] = speed / 60.0
    return {key: f[inverse] for key, f in out.items()}


def _sample_speeds(signed: dict[str, np.ndarray], grid: np.ndarray) -> np.ndarray:
    """The grid plus every speed where a component's direction flips, so the
    |frequency| polylines keep their V-shaped kinks."""
    extra: list[float] = []
    for f in signed.values():
        s = np.sign(f)
        for i in np.flatnonzero(s[:-1] * s[1:] < 0):
            a, b = f[i], f[i + 1]
            extra.append(float(grid[i] + (grid[i + 1] - grid[i]) * a / (a - b)))
    return np.unique(np.concatenate([grid, np.asarray(extra, dtype=float)]))


def component_lines(
    machine: Machine, rpm_min: float, rpm_max: float
) -> dict[str, list[float] | dict[str, list[float]]]:
    """Every component's order-1 frequency (Hz) on one speed grid: what a
    user's order line pinned to a component is drawn from, exactly, even
    where that component shares a merged order line with another."""
    lo = max(0.0, rpm_min)
    hi = max(lo + 1e-6, rpm_max)
    grid = np.linspace(lo, hi, LINE_SAMPLES)
    rpms = _sample_speeds(_line_freqs(machine, grid), grid)
    freqs = _line_freqs(machine, rpms)
    return {
        "rpm": [round(float(r), 2) for r in rpms],
        "freq_hz": {k: [round(float(abs(f)), 4) for f in v] for k, v in freqs.items()},
    }


def build_order_lines(
    machine: Machine,
    rpm_min: float,
    rpm_max: float,
    freq_max: float,
    freq_step: float,
) -> list[OrderLine]:
    """Every component order that reaches into the measured frequency range."""
    lo = max(0.0, rpm_min)
    hi = max(lo + 1e-6, rpm_max)
    grid = np.linspace(lo, hi, LINE_SAMPLES)
    rpms = _sample_speeds(_line_freqs(machine, grid), grid)
    signed = _line_freqs(machine, rpms)
    # Two speeds to compare lines at: the top of the sweep and its middle.
    probes = np.array([hi, (lo + hi) / 2])
    probe_f = {k: np.abs(v) for k, v in _line_freqs(machine, probes).items()}
    tol = COINCIDENT_LINES * max(freq_step, 1e-3)

    candidates: list[tuple[LineMember, str, np.ndarray, np.ndarray]] = []
    for comp in machine.components:
        kind = "mechanical" if machine.is_mechanical(comp.key) else "electrical"
        f1 = np.abs(signed[comp.key])
        for k in range(1, comp.max_order + 1):
            f = f1 * k
            if f.min() > freq_max or f.max() <= 0:
                continue
            candidates.append((LineMember(comp.key, k), kind, f, probe_f[comp.key] * k))

    lines: list[OrderLine] = []
    groups: list[tuple[list[int], np.ndarray]] = []  # member indices, probe freqs
    for i, (_, kind, _, probe) in enumerate(candidates):
        for members, ref in groups:
            if candidates[members[0]][1] == kind and np.all(np.abs(ref - probe) < tol):
                members.append(i)
                break
        else:
            groups.append(([i], probe))
    for members, _ in groups:
        first = candidates[members[0]]
        lines.append(
            OrderLine(
                id="+".join(
                    f"{candidates[m][0].component}@{candidates[m][0].order}" for m in members
                ),
                members=[candidates[m][0] for m in members],
                kind=first[1],
                rpm=[round(float(r), 2) for r in rpms],
                freq_hz=[round(float(f), 4) for f in first[2]],
            )
        )
    return lines


def track_lines(
    lines: list[OrderLine],
    machine: Machine,
    spec: SpectrumArrays,
    *,
    window_hz: float,
) -> None:
    """Fill each mechanical line's amplitude track (in place): the highest
    line within ±window of where the line is, in each spectrum."""
    order = np.argsort(spec.ref_speeds, kind="stable")
    rpms = spec.ref_speeds[order]
    z = spec.z_matrix[order]
    freq = spec.freq_axis
    if freq.size < 2 or rpms.size == 0:
        return
    half = max(window_hz, 1.5 * float(freq[1] - freq[0]))
    f1 = {k: np.abs(v) for k, v in _line_freqs(machine, rpms).items()}
    for line in lines:
        if line.kind != "mechanical":
            continue
        lead = line.members[0]
        f = f1[lead.component] * lead.order
        lo = np.searchsorted(freq, f - half, side="left")
        hi = np.searchsorted(freq, f + half, side="right")
        inside = (f >= freq[0]) & (f <= freq[-1]) & (hi > lo)
        if not inside.any():
            continue
        amps = np.array([z[b, lo[b] : hi[b]].max() for b in np.flatnonzero(inside)])
        line.track_rpm = [round(float(r), 2) for r in rpms[inside]]
        line.track_amp = [round(float(a), 5) for a in amps]
        best = int(np.argmax(amps))
        line.peak_amp = float(amps[best])
        line.peak_rpm = float(rpms[inside][best])
        line.peak_freq_hz = float(f[inside][best])


def _bumps(
    line: OrderLine,
    f: np.ndarray,
    usable: np.ndarray,
    *,
    min_prominence_db: float,
    floor: float,
    min_amp: float,
) -> list[tuple[float, float, ZoneEvidence]]:
    """Local maxima of a line's track that stand out from their surroundings:
    (lo_hz, hi_hz, evidence) per bump. The range is the bump's width at half
    its prominence, at most ±ZONE_HALF_WIDTH of its frequency."""
    amps = np.asarray(line.track_amp)[usable]
    rpms = np.asarray(line.track_rpm)[usable]
    f = f[usable]
    if amps.size < 7:
        return []
    # Light smoothing: a 3-point median drops single-spectrum spikes.
    smooth = median_filter(amps, size=3, mode="nearest")
    level = 20 * np.log10(np.maximum(smooth, floor))
    peaks, props = find_peaks(level, prominence=min_prominence_db, width=1, rel_height=0.5)
    out = []
    idx = np.arange(len(f))
    for j, p in enumerate(peaks):
        if smooth[p] < min_amp:
            continue
        a = float(np.interp(props["left_ips"][j], idx, f))
        b = float(np.interp(props["right_ips"][j], idx, f))
        fp = float(f[p])
        out.append(
            (
                max(min(a, b), fp * (1 - ZONE_HALF_WIDTH)),
                min(max(a, b), fp * (1 + ZONE_HALF_WIDTH)),
                ZoneEvidence(
                    line_id=line.id,
                    freq_hz=fp,
                    rpm=float(rpms[p]),
                    amplitude=float(amps[p]),
                    prominence_db=float(props["prominences"][j]),
                ),
            )
        )
    return out


_Bump = tuple[float, float, ZoneEvidence]


def _merge_overlapping(groups: list[list[_Bump]]) -> list[list[_Bump]]:
    """Join neighbouring groups whose ranges overlap by at least half the
    narrower one (two views of one resonance), but not mere neighbours."""
    out: list[list[_Bump]] = []
    for g in groups:
        if out:
            prev = out[-1]
            a = (min(b[0] for b in prev), max(b[1] for b in prev))
            c = (min(b[0] for b in g), max(b[1] for b in g))
            overlap = min(a[1], c[1]) - max(a[0], c[0])
            if overlap > 0 and overlap >= 0.5 * min(a[1] - a[0], c[1] - c[0]):
                prev.extend(g)
                continue
        out.append(list(g))
    return out


def find_resonance_zones(
    lines: list[OrderLine],
    machine: Machine,
    spec: SpectrumArrays,
    *,
    stationary_hz: list[float],
    window_hz: float,
    max_order: int = 3,
    min_prominence_db: float = 6.0,
    single_line_db: float = 12.0,
    min_freq_hz: float = 5.0,
) -> list[ResonanceZone]:
    """Frequency ranges where tracked lines swell together.

    Only the mechanical lines up to `max_order` count: higher orders are
    weak and so dense that they cross everywhere. Where a line passes a
    speed-independent line or another counted line, its reading is not its
    own and is skipped. A zone needs bumps on two independent lines within
    ±ZONE_HALF_WIDTH of each other, or one bump of at least
    `single_line_db`; bumps must clear 3 × the sweep's noise floor and 2 %
    of the strongest counted line.
    """
    counted = [
        ln
        for ln in lines
        if ln.kind == "mechanical"
        and ln.track_amp
        and all(m.order <= max_order for m in ln.members)
    ]
    if not counted or spec.freq_axis.size < 2:
        return []
    noise = max(float(np.median(spec.z_matrix)), 1e-6)
    min_amp = max(3 * noise, 0.02 * max(ln.peak_amp for ln in counted))
    half = max(window_hz, 1.5 * float(spec.freq_axis[1] - spec.freq_axis[0]))
    lowest = max(min_freq_hz, 10 * float(spec.freq_axis[1] - spec.freq_axis[0]))

    # Each counted line's frequency at its tracked speeds. The lines share
    # their speeds, so the formulas are evaluated once for all of them.
    speeds = np.unique(np.concatenate([np.asarray(ln.track_rpm) for ln in counted]))
    f1_all = {k: np.abs(v) for k, v in _line_freqs(machine, speeds).items()}
    freqs: dict[str, np.ndarray] = {}
    for ln in counted:
        lead = ln.members[0]
        at = np.searchsorted(speeds, np.asarray(ln.track_rpm))
        freqs[ln.id] = f1_all[lead.component][at] * lead.order

    bumps: list[_Bump] = []
    for ln in counted:
        f = freqs[ln.id]
        usable = f >= lowest
        for s in stationary_hz:
            usable &= np.abs(f - s) > 2 * half
        rpms = np.asarray(ln.track_rpm)
        for other in counted:
            if other is ln:
                continue
            g = np.interp(rpms, np.asarray(other.track_rpm), freqs[other.id])
            usable &= np.abs(f - g) > 2 * half
        bumps.extend(
            _bumps(
                ln,
                f,
                usable,
                min_prominence_db=min_prominence_db,
                floor=noise,
                min_amp=min_amp,
            )
        )

    # Group bumps whose frequencies lie within ±ZONE_HALF_WIDTH of the group's
    # weighted centre (no chaining from one neighbour to the next).
    bumps.sort(key=lambda b: b[2].freq_hz)
    groups: list[list[_Bump]] = []
    for bump in bumps:
        if groups:
            g = groups[-1]
            w = np.array([b[2].prominence_db for b in g])
            centre = float((w * np.array([b[2].freq_hz for b in g])).sum() / w.sum())
            if abs(bump[2].freq_hz - centre) <= ZONE_HALF_WIDTH * centre:
                g.append(bump)
                continue
        groups.append([bump])

    top = max(ln.peak_amp for ln in counted)
    zones: list[ResonanceZone] = []
    for group in _merge_overlapping(groups):
        best: dict[str, _Bump] = {}
        for bump in group:
            lid = bump[2].line_id
            if lid not in best or bump[2].prominence_db > best[lid][2].prominence_db:
                best[lid] = bump
        chosen = sorted(best.values(), key=lambda b: -b[2].prominence_db)
        strongest = chosen[0][2].prominence_db
        if len(chosen) < 2 and strongest < single_line_db:
            continue
        evidence = [b[2] for b in chosen]
        weights = np.array([e.prominence_db for e in evidence])
        centres = np.array([e.freq_hz for e in evidence])
        lo = round(min(b[0] for b in chosen), 2)
        hi = round(max(b[1] for b in chosen), 2)
        peak = max(e.amplitude for e in evidence)
        zones.append(
            ResonanceZone(
                lo_hz=lo,
                hi_hz=hi,
                center_hz=round(float((weights * centres).sum() / weights.sum()), 2),
                confidence=round(min(1.0, 0.3 * (len(chosen) - 1) + strongest / 30.0), 3),
                peak_amplitude=peak,
                relative_amplitude=round(peak / top, 4) if top > 0 else 0.0,
                evidence=evidence[:8],
                modes=[m.name for m in machine.profile.structural_modes if lo <= m.freq_hz <= hi],
            )
        )
    return sorted(zones, key=lambda z: z.center_hz)
