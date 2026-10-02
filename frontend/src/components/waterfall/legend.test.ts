import { describe, expect, it } from 'vitest';

import { legendTicks, type LegendScale } from './legend';

/** The colour scales of model.ts: linear, or logarithmic over `rangeDb`. */
const scale = (maxAmp: number, rangeDb: number | null = null): LegendScale =>
  rangeDb === null
    ? {
        maxAmp,
        colourUnit: (a) => Math.min(1, Math.max(0, a / maxAmp)),
        ampOfColourUnit: (t) => maxAmp * t,
      }
    : {
        maxAmp,
        colourUnit: (a) => Math.max(0, Math.min(1, 1 + (20 * Math.log10(a / maxAmp)) / rangeDb)),
        ampOfColourUnit: (t) => maxAmp * 10 ** (((t - 1) * rangeDb) / 20),
      };

describe('legendTicks', () => {
  it('runs from zero to the maximum, in order, with room between labels', () => {
    const ticks = legendTicks(scale(63.4));
    expect(ticks[0]).toEqual({ t: 0, value: 0 });
    expect(ticks.at(-1)).toEqual({ t: 1, value: 63.4 });
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].t - ticks[i - 1].t).toBeGreaterThanOrEqual(0.16 - 1e-9);
    }
    expect(ticks.map((k) => k.value)).toEqual([0, 20, 50, 63.4]);
  });

  it('shows the spread: on a log scale small values climb the bar and get labels', () => {
    const even = legendTicks(scale(63.4)).map((k) => k.value);
    const detail = legendTicks(scale(63.4, 70));
    expect(detail.length).toBeGreaterThan(even.length);
    expect(detail.map((k) => k.value)).toEqual([
      expect.closeTo(63.4 / 10 ** 3.5, 9),
      0.1,
      0.5,
      2,
      10,
      63.4,
    ]);
    expect(even).not.toContain(0.1);
    // The bottom of a log scale is its floor, 70 dB below the peak.
    expect(detail[0].t).toBe(0);
    expect(detail[0].value).toBeCloseTo(63.4 / 10 ** 3.5, 9);
  });

  it('has nothing to show without a signal', () => {
    expect(legendTicks(scale(0))).toEqual([]);
  });
});
