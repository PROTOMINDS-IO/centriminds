"""Analysis-pipeline orchestrator.

One call analyses a project's speed sweep against its machine profile:

1. speed-independent lines (mains, structure), classified
2. peaks per spectrum, matched to the orders of the profile's components
   (a peak on an electrical line of step 1 is the mains, whatever order
   passes through it)
3. order lines across the sweep, and the amplitude tracked along each
4. resonance zones, where several tracked lines swell at one frequency
   (away from the lines of step 1)
5. the decanter severity rating
6. the profile's structural modes checked against the sweep

It persists the result as an `AnalysisRun` (keeping the newest
`KEPT_RUNS` per project) and replaces any prior auto-physics `Annotation`
rows with the new findings. User-authored annotations are never touched.
The run records the fingerprint of its inputs (`profiles.inputs_hash`), so
the web app can tell when it is out of date.
"""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import (
    ANALYSIS_PHYSICS,
    ANNOTATION_STATIONARY_LINE,
    ANNOTATION_STATUS_ACTIVE,
    AUTHOR_AUTO_PHYSICS,
    STATUS_ANNOTATED,
    STATUS_NEW,
    AnalysisRun,
    Annotation,
    Project,
)
from ..physics.kinematics import Machine, compile_machine
from ..physics.profile import MachineProfileData
from .attribution import AttributedPeak, attribute_peaks
from .decanter_severity import DecanterSeverity, compute_decanter_severity
from .orders import (
    OrderLine,
    ResonanceZone,
    build_order_lines,
    component_lines,
    find_resonance_zones,
    track_lines,
)
from .peak_detection import detect_peaks
from .spectrogram import SpectrumArrays, load_arrays
from .stationary import KIND_ELECTRICAL, StationaryLine, find_stationary_lines

PIPELINE_VERSION = "3.1.0"

#: Analysis runs kept per project, newest first. Only the newest is shown;
#: each run holds every peak (up to ~1.5 MB), so older ones are deleted.
KEPT_RUNS = 5


# A request can override each of these within the bounds of
# `schemas.AnalysisParams`; the run stores the values it used.
DEFAULT_PHYSICS_PARAMS: dict[str, Any] = {
    "prominence_ratio": 0.05,
    "max_peaks_per_block": 30,
    "attribution_tolerance_hz": 0.5,
    # Cap on the orders matched and drawn (each component has its own too).
    "max_harmonic": 10,
    # Resonance zones are looked for on the orders up to this one.
    "zone_max_order": 3,
    # A bump on a tracked order line counts from this height (dB) …
    "zone_min_prominence_db": 6.0,
    # … and makes a zone on its own from this height.
    "zone_single_line_db": 12.0,
    # A speed-independent line stands this many times above its surroundings.
    "stationary_min_contrast": 3.0,
    "severity_band_lo_hz": 10.0,
    "severity_band_hi_hz": 1000.0,
    # How the .odx spectrum lines are scaled: "rms" (VIBXPERT default for
    # velocity) or "peak". Drives the overall-velocity computation.
    "spectrum_amplitude": "rms",
    # Blocks at or above this fraction of the sweep's top speed count as
    # operating speed, where the rating is taken.
    "operating_speed_fraction": 0.9,
    # The strongest line within ±this fraction of a structural mode's
    # frequency is reported as that mode's response.
    "structural_mode_tolerance": 0.15,
}


def _crossing_rpm(line: OrderLine | None, freq_hz: float) -> float | None:
    """The first speed (rising) at which a line passes a frequency."""
    if line is None:
        return None
    rpm, f = np.asarray(line.rpm), np.asarray(line.freq_hz)
    for i in range(len(f) - 1):
        a, b = f[i] - freq_hz, f[i + 1] - freq_hz
        if a == 0:
            return float(rpm[i])
        if a * b < 0:
            return float(rpm[i] + (rpm[i + 1] - rpm[i]) * a / (a - b))
    return None


def _structural_mode_checks(
    spec: SpectrumArrays,
    machine: Machine,
    lines: list[OrderLine],
    tolerance: float,
) -> list[dict[str, Any]]:
    """For each known structural mode: where the reference component's 1×
    (the first mechanical one, usually the bowl) crosses it, and the
    strongest response measured near it anywhere in the sweep."""
    freq, speeds, z = spec.freq_axis, spec.ref_speeds, spec.z_matrix
    reference = next((c for c in machine.components if machine.is_mechanical(c.key)), None)
    ref_line = next(
        (
            ln
            for ln in lines
            if reference and any(m.component == reference.key and m.order == 1 for m in ln.members)
        ),
        None,
    )
    out: list[dict[str, Any]] = []
    for mode in machine.profile.structural_modes:
        lo, hi = mode.freq_hz * (1 - tolerance), mode.freq_hz * (1 + tolerance)
        mask = (freq >= lo) & (freq <= hi)
        entry: dict[str, Any] = {
            "name": mode.name,
            "source": mode.source,
            "freq_hz": mode.freq_hz,
            "crossing_component": reference.key if reference else None,
            "crossing_rpm": _crossing_rpm(ref_line, mode.freq_hz),
            "search_lo_hz": lo,
            "search_hi_hz": hi,
            "response_mm_s": None,
            "response_freq_hz": None,
            "response_rpm": None,
        }
        if mask.any() and z.size:
            band = z[:, mask]
            b, f = np.unravel_index(int(band.argmax()), band.shape)
            entry["response_mm_s"] = float(band[b, f])
            entry["response_freq_hz"] = float(freq[mask][f])
            entry["response_rpm"] = float(speeds[b])
        out.append(entry)
    return out


def _prefer_electrical(
    peaks: list[AttributedPeak], lines: list[StationaryLine], tolerance_hz: float
) -> list[AttributedPeak]:
    """A peak on a speed-independent electrical line is the mains, even where
    a mechanical order passes through it (a bowl turning at 3000 rpm runs at
    the 50 Hz mains frequency)."""
    mains = [s for s in lines if s.kind == KIND_ELECTRICAL and s.source]
    if not mains:
        return peaks
    out = []
    for p in peaks:
        line = min(mains, key=lambda s: abs(s.freq_hz - p.freq_hz))
        delta = abs(line.freq_hz - p.freq_hz)
        if delta <= max(tolerance_hz, line.width_hz / 2) and p.source_id != line.source:
            p = AttributedPeak(
                block_idx=p.block_idx,
                rpm=p.rpm,
                freq_hz=p.freq_hz,
                amplitude=p.amplitude,
                source_id=line.source,
                harmonic=line.order or 1,
                expected_freq_hz=line.freq_hz,
                delta_hz=delta,
                confidence=max(0.0, 1.0 - delta / max(tolerance_hz, 1e-9)),
            )
        out.append(p)
    return out


def _cap_orders(machine: Machine, max_harmonic: int) -> Machine:
    """The machine with every component's orders capped at `max_harmonic`."""
    profile = machine.profile
    components = [
        c.model_copy(update={"max_order": min(c.max_order, max_harmonic)})
        for c in profile.components
    ]
    return compile_machine(profile.model_copy(update={"components": components}), machine.values)


def _order_line_json(line: OrderLine) -> dict[str, Any]:
    """An order line as a run stores it: without its amplitude track, which
    only the zone search uses and which was over a third of a run's size."""
    out = asdict(line)
    del out["track_rpm"], out["track_amp"]
    return out


def analyse(
    spec: SpectrumArrays,
    machine: Machine,
    params: dict[str, Any],
    bowl_diameter_mm: float | None,
) -> dict[str, Any]:
    """The physics analysis of one sweep, as the JSON a run stores."""
    freq, speeds, z = spec.freq_axis, spec.ref_speeds, spec.z_matrix
    tol = params["attribution_tolerance_hz"]
    step = float(freq[1] - freq[0]) if freq.size > 1 else 1.0

    raw_peaks = detect_peaks(
        freq,
        speeds,
        z,
        prominence_ratio=params["prominence_ratio"],
        max_peaks_per_block=params["max_peaks_per_block"],
    )
    stationary = find_stationary_lines(
        spec, machine, tolerance_hz=tol, min_contrast=params["stationary_min_contrast"]
    )
    attributed = _prefer_electrical(
        attribute_peaks(raw_peaks, machine, tolerance_hz=tol, max_harmonic=params["max_harmonic"]),
        stationary,
        tol,
    )

    rpm_min = float(speeds.min()) if speeds.size else 0.0
    rpm_max = float(speeds.max()) if speeds.size else 0.0
    capped = _cap_orders(machine, params["max_harmonic"])
    lines = build_order_lines(
        capped, rpm_min, rpm_max, float(freq.max()) if freq.size else 0.0, step
    )
    track_lines(lines, capped, spec, window_hz=tol)
    zones: list[ResonanceZone] = find_resonance_zones(
        lines,
        capped,
        spec,
        stationary_hz=[s.freq_hz for s in stationary],
        window_hz=tol,
        max_order=params["zone_max_order"],
        min_prominence_db=params["zone_min_prominence_db"],
        single_line_db=params["zone_single_line_db"],
    )

    severity: DecanterSeverity = compute_decanter_severity(
        freq,
        speeds,
        z,
        bowl_diameter_mm=bowl_diameter_mm,
        band_lo_hz=params["severity_band_lo_hz"],
        band_hi_hz=params["severity_band_hi_hz"],
        amplitude_scale=params["spectrum_amplitude"],
        operating_speed_fraction=params["operating_speed_fraction"],
    )
    modes = _structural_mode_checks(spec, machine, lines, params["structural_mode_tolerance"])
    profile = machine.profile
    return {
        "machine": {
            "name": profile.name,
            "components": [
                {"key": c.key, "label": c.label, "kind": c.kind, "max_order": c.max_order}
                for c in profile.components
            ],
            "parameters": machine.values,
        },
        "peaks": [asdict(p) for p in attributed],
        "order_lines": [_order_line_json(ln) for ln in lines],
        "component_lines": component_lines(machine, rpm_min, rpm_max),
        "resonance_zones": [asdict(zn) for zn in zones],
        "stationary_lines": [asdict(s) for s in stationary],
        "known_zones": [zn.model_dump() for zn in profile.resonance_zones],
        "severity": asdict(severity),
        "structural_modes": modes,
    }


def _build_auto_annotations(project_id: int, physics: dict[str, Any]) -> list[Annotation]:
    """Strongest peak per (component, order), one band per resonance zone and
    one line per speed-independent line."""
    out: list[Annotation] = []
    groups: dict[tuple[str, int], dict[str, Any]] = {}
    for p in physics["peaks"]:
        if p["source_id"] is None:
            continue
        key = (p["source_id"], p["harmonic"])
        if key not in groups or p["amplitude"] > groups[key]["amplitude"]:
            groups[key] = p
    labels = {c["key"]: c["label"] for c in physics["machine"]["components"]}
    for (source_id, order), p in groups.items():
        out.append(
            Annotation(
                project_id=project_id,
                annotation_type="peak",
                freq_hz=p["freq_hz"],
                rpm=p["rpm"],
                amplitude=p["amplitude"],
                label=f"{labels.get(source_id, source_id)} {order}×",
                author=AUTHOR_AUTO_PHYSICS,
                confidence=p["confidence"],
                status=ANNOTATION_STATUS_ACTIVE,
                payload_json=json.dumps(
                    {
                        "source_id": source_id,
                        "harmonic": order,
                        "expected_freq_hz": p["expected_freq_hz"],
                        "delta_hz": p["delta_hz"],
                        "block_idx": p["block_idx"],
                    }
                ),
            )
        )
    for zone in physics["resonance_zones"]:
        out.append(
            Annotation(
                project_id=project_id,
                annotation_type="band",
                freq_hz=zone["lo_hz"],
                freq_hz_end=zone["hi_hz"],
                amplitude=zone["peak_amplitude"],
                label=f"Possible resonance {zone['lo_hz']:.0f}–{zone['hi_hz']:.0f} Hz",
                author=AUTHOR_AUTO_PHYSICS,
                confidence=zone["confidence"],
                status=ANNOTATION_STATUS_ACTIVE,
                payload_json=json.dumps(
                    {
                        "center_hz": zone["center_hz"],
                        "lines": [e["line_id"] for e in zone["evidence"]],
                    }
                ),
            )
        )
    for line in physics["stationary_lines"]:
        out.append(
            Annotation(
                project_id=project_id,
                annotation_type=ANNOTATION_STATIONARY_LINE,
                freq_hz=line["freq_hz"],
                amplitude=line["median_amp"],
                label=f"Speed-independent {line['freq_hz']:.1f} Hz ({line['kind']})",
                author=AUTHOR_AUTO_PHYSICS,
                confidence=line["presence"],
                status=ANNOTATION_STATUS_ACTIVE,
                payload_json=json.dumps(
                    {"kind": line["kind"], "source": line["source"], "contrast": line["contrast"]}
                ),
            )
        )
    return out


def _delete_auto_physics_annotations(session: Session, project_id: int) -> None:
    session.execute(
        delete(Annotation).where(
            Annotation.project_id == project_id,
            Annotation.author == AUTHOR_AUTO_PHYSICS,
        )
    )


def _delete_old_runs(session: Session, project_id: int) -> None:
    """Delete all but the newest KEPT_RUNS runs of the project (flushed ones
    included)."""
    session.flush()
    kept = (
        select(AnalysisRun.id)
        .where(AnalysisRun.project_id == project_id)
        .order_by(AnalysisRun.created_at.desc(), AnalysisRun.id.desc())
        .limit(KEPT_RUNS)
    )
    session.execute(
        delete(AnalysisRun).where(AnalysisRun.project_id == project_id, AnalysisRun.id.not_in(kept))
    )


def run_and_persist(
    session: Session,
    settings: Settings,
    project: Project,
    profile: MachineProfileData,
    inputs_hash: str,
    *,
    physics_params_overrides: dict[str, Any] | None = None,
) -> tuple[AnalysisRun, int]:
    """Run the physics analysis; persist the run and its auto annotations.

    Returns the run and how many annotations it created.
    """
    params = {**DEFAULT_PHYSICS_PARAMS, **(physics_params_overrides or {})}
    spec = load_arrays(settings, project.id)
    machine = compile_machine(profile, project.machine_parameters)
    bowl_diameter_mm = project.bowl_diameter_mm or profile.bowl_diameter_mm

    physics = analyse(spec, machine, params, bowl_diameter_mm)

    physics_run = AnalysisRun(
        project_id=project.id,
        type=ANALYSIS_PHYSICS,
        version=PIPELINE_VERSION,
        params_json=json.dumps({**params, "inputs_hash": inputs_hash}),
        results_json=json.dumps(physics),
    )
    session.add(physics_run)
    _delete_old_runs(session, project.id)

    _delete_auto_physics_annotations(session, project.id)
    new_annotations = _build_auto_annotations(project.id, physics)
    session.add_all(new_annotations)

    if new_annotations and project.status == STATUS_NEW:
        project.status = STATUS_ANNOTATED

    session.commit()
    session.refresh(physics_run)
    return physics_run, len(new_annotations)
