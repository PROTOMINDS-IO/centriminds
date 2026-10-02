// What the analysis overlays draw, worked out apart from three.js so it can
// be tested: which order lines and zones show, the points of a line laid on
// the surface, and what a reading under the pointer lies on.
import type {
  AnnotationRead,
  AttributedPeak,
  OrderLine,
  PhysicsResults,
  ResonanceZone,
} from '../../api/types';
import type { ZoneFilter } from '../../store/uiStore';
import type { WaterfallModel } from './model';

type Vec3 = [number, number, number];

/** A suggested zone counts as strong when it is likely a resonance (≥ 0.6)
 *  and matters (≥ 10 % of the strongest line's amplitude). */
const STRONG_ZONE = { confidence: 0.6, relativeAmplitude: 0.1 };

export function zoneShown(zone: ResonanceZone, filter: ZoneFilter): boolean {
  return (
    filter === 'all' ||
    (zone.confidence >= STRONG_ZONE.confidence &&
      zone.relative_amplitude >= STRONG_ZONE.relativeAmplitude)
  );
}

/** Lines whose lowest order is at most `maxOrder` and that draw at least one
 *  component the user has not hidden. */
export function linesShown(
  lines: OrderLine[],
  maxOrder: number,
  hidden: readonly string[],
): OrderLine[] {
  return lines.filter(
    (l) =>
      Math.min(...l.members.map((m) => m.order)) <= maxOrder &&
      l.members.some((m) => !hidden.includes(m.component)),
  );
}

/** Linear interpolation of `ys` over ascending `xs` at x (null outside). */
function interpolate(xs: number[], ys: number[], x: number): number | null {
  const n = xs.length;
  if (n === 0 || x < xs[0] || x > xs[n - 1]) return null;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi] - xs[lo];
  return span > 0 ? ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / span : ys[lo];
}

/** Amplitude of a row at a frequency, between its two nearest lines. */
export function ampAt(model: WaterfallModel, row: number, freqHz: number): number {
  const values = model.rows[row];
  if (!values || model.nBins < 2) return 0;
  const pos = ((freqHz - model.freqMin) / (model.freqMax - model.freqMin)) * (model.nBins - 1);
  const b = Math.max(0, Math.min(model.nBins - 2, Math.floor(pos)));
  const t = Math.max(0, Math.min(1, pos - b));
  return values[b] * (1 - t) + values[b + 1] * t;
}

/**
 * A line given as frequency against speed, laid on the surface: one point
 * per row shown, just above the amplitude there, so it traces the ridge an
 * order makes. Split where it leaves the frequency range.
 */
export function surfacePath(
  model: WaterfallModel,
  freqAtRpm: (rpm: number) => number | null,
  lift = 0.008,
): Vec3[][] {
  const out: Vec3[][] = [];
  let run: Vec3[] = [];
  for (let r = 0; r < model.nRows; r++) {
    const f = freqAtRpm(model.rpm[r]);
    if (f == null || f < model.freqMin || f > model.freqMax) {
      if (run.length > 1) out.push(run);
      run = [];
      continue;
    }
    run.push([model.xOfFreq(f), model.yOfAmp(ampAt(model, r, f)) + lift, model.rowZ[r]]);
  }
  if (run.length > 1) out.push(run);
  return out;
}

/** The frequency of an order line at a speed (null outside its samples). */
export function lineFreqAt(line: Pick<OrderLine, 'rpm' | 'freq_hz'>, rpm: number): number | null {
  return interpolate(line.rpm, line.freq_hz, rpm);
}

/** The line passing nearest to a reading, within `tolHz`. */
export function lineNear(
  lines: OrderLine[],
  rpm: number,
  freqHz: number,
  tolHz: number,
): OrderLine | null {
  let best: OrderLine | null = null;
  let bestDelta = tolHz;
  for (const line of lines) {
    const f = lineFreqAt(line, rpm);
    if (f == null) continue;
    const d = Math.abs(f - freqHz);
    if (d <= bestDelta) {
      best = line;
      bestDelta = d;
    }
  }
  return best;
}

/** What a reading lies on: an attributed peak or an order line. */
export type ReadingSource =
  { kind: 'peak'; peak: AttributedPeak } | { kind: 'line'; line: OrderLine };

/** What the reading at `rpm`, `freqHz` lies on: the attributed peak at that
 *  speed nearest to it, else the line (of those shown) passing there. Peaks
 *  come from the full-resolution spectra and the preview pools its bins,
 *  hence a tolerance of 1.5 preview bins (at least 0.5 Hz). */
export function readingSource(
  model: Pick<WaterfallModel, 'freqMin' | 'freqMax' | 'nBins'>,
  peaks: AttributedPeak[],
  lines: OrderLine[],
  reading: { rpm: number; freqHz: number },
): ReadingSource | null {
  const binWidth = (model.freqMax - model.freqMin) / Math.max(1, model.nBins - 1);
  const tol = Math.max(0.5, binWidth * 1.5);
  let best: AttributedPeak | null = null;
  for (const p of peaks) {
    if (!p.source_id || Math.abs(p.rpm - reading.rpm) > 0.5) continue;
    const d = Math.abs(p.freq_hz - reading.freqHz);
    if (d <= tol && (!best || d < Math.abs(best.freq_hz - reading.freqHz))) best = p;
  }
  if (best) return { kind: 'peak', peak: best };
  const line = lineNear(lines, reading.rpm, reading.freqHz, tol);
  return line ? { kind: 'line', line } : null;
}

/** The frequency a user's order line has at a speed: `order` × the measured
 *  speed, or, pinned to a component, `order` × that component's own speed. */
export function userOrderFreq(
  ann: Pick<AnnotationRead, 'payload'>,
  physics: PhysicsResults | undefined,
  rpm: number,
): number | null {
  const order = Number(ann.payload.order);
  if (!(order > 0)) return null;
  const component = ann.payload.component;
  if (!component) return (order * rpm) / 60;
  const lines = physics?.component_lines;
  const freqs = lines?.freq_hz[component];
  if (!lines || !freqs) return null;
  const f = interpolate(lines.rpm, freqs, rpm);
  return f == null ? null : f * order;
}

/** Heights to lift labels by so neighbours along x do not overlap: each
 *  label closer than `gap` to the one before it (in x order) goes up a step
 *  more. Returned in the order of `xs`. */
export function staggered(xs: number[], gap: number, step: number): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length).fill(0);
  let level = 0;
  for (let k = 0; k < order.length; k++) {
    level = k > 0 && order[k][0] - order[k - 1][0] < gap ? level + 1 : 0;
    out[order[k][1]] = level * step;
  }
  return out;
}
