// Round tick values for the axes of every chart: the 3D waterfall, the
// spectrum at one speed and the speed trend.

/** Round tick values within [lo, hi], in steps of 1, 2 or 5 × 10ⁿ sized for
 *  about `target` ticks; just [lo] for an empty or invalid range. */
export function niceTicks(lo: number, hi: number, target: number): number[] {
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return [lo];
  const raw = (hi - lo) / Math.max(1, target - 1);
  const exp = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const step = (base < 1.5 ? 1 : base < 3 ? 2 : base < 7 ? 5 : 10) * 10 ** exp;
  const out: number[] = [];
  // Rounded to the step's decimals: repeated addition drifts (0.1 + 0.2).
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(Math.max(0, -Math.floor(Math.log10(step))))));
  }
  return out;
}

/** Ticks for an axis from 0 whose top must reach `max`, the tallest value
 *  drawn: niceTicks up to 10 % above it, plus the next step when the last
 *  tick falls short (12 → 0, 5, 10, 15). */
export function ticksReaching(max: number, target: number): number[] {
  const ticks = niceTicks(0, max * 1.1, target);
  const last = ticks[ticks.length - 1];
  if (ticks.length > 1 && last < max) {
    ticks.push(Number((last + ticks[1] - ticks[0]).toPrecision(12)));
  }
  return ticks;
}
