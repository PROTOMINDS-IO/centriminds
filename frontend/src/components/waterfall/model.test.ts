import { describe, expect, it } from 'vitest';

import { buildData, buildModel, freqWindow } from './model';
import { coastDown } from './testData';

describe('buildModel', () => {
  it('orders rows by rpm whatever the recording order', () => {
    const m = buildModel(coastDown(), { scale: 'linear', height: 1, rpmFilter: null });
    expect(m.rpm).toEqual([...m.rpm].sort((a, b) => a - b));
    expect(m.rpmMin).toBe(250);
    expect(m.rpmMax).toBe(3000);
  });

  it('puts slow speeds in front (+z) and fast speeds at the back (-z)', () => {
    const m = buildModel(coastDown(), { scale: 'linear', height: 1, rpmFilter: null });
    expect(m.zOfRpm(250)).toBeCloseTo(1);
    expect(m.zOfRpm(3000)).toBeCloseTo(-1);
    expect(m.rowZ[0]).toBeCloseTo(1);
    expect(m.rowZ[m.nRows - 1]).toBeCloseTo(-1);
  });

  it('inverts row positions', () => {
    const m = buildModel(coastDown(), { scale: 'linear', height: 1, rpmFilter: null });
    for (let r = 0; r < m.nRows; r++) expect(m.rowAtZ(m.rowZ[r])).toBeCloseTo(r);
  });

  it('maps amplitude on linear and log scales, with a working inverse', () => {
    const lin = buildModel(coastDown(4, 4, { row: 0, bin: 0, amp: 100 }), {
      scale: 'linear',
      height: 1,
      rpmFilter: null,
    });
    expect(lin.unit(50)).toBeCloseTo(0.5);
    expect(lin.ampOfUnit(0.5)).toBeCloseTo(50);
    const log = buildModel(coastDown(4, 4, { row: 0, bin: 0, amp: 100 }), {
      scale: 'log',
      height: 1,
      rpmFilter: null,
    });
    expect(log.unit(100)).toBeCloseTo(1);
    expect(log.unit(1)).toBeCloseTo(1 - 40 / 50); // 40 dB below max of a 50 dB range
    expect(log.ampOfUnit(log.unit(3))).toBeCloseTo(3);
  });

  it('applies the speed filter and ignores an empty window', () => {
    const f = buildModel(coastDown(), {
      scale: 'linear',
      height: 1,
      rpmFilter: { min: 900, max: 2100 },
    });
    expect(Math.min(...f.rpm)).toBeGreaterThanOrEqual(900);
    expect(Math.max(...f.rpm)).toBeLessThanOrEqual(2100);
    const all = buildModel(coastDown(), {
      scale: 'linear',
      height: 1,
      rpmFilter: { min: 5000, max: 6000 },
    });
    expect(all.nRows).toBe(12);
  });
});

describe('colour spread', () => {
  const spec = coastDown(6, 8);
  const at = (spread: 'even' | 'balanced' | 'detail', scale: 'linear' | 'log' = 'linear') =>
    buildModel(spec, { scale, height: 1, rpmFilter: null, spread });

  it('colours small amplitudes logarithmically, heights unchanged', () => {
    const even = at('even');
    const quiet = even.maxAmp / 100; // 40 dB below the peak
    expect(even.colourUnit(quiet)).toBeCloseTo(0.01, 6);
    expect(at('balanced').colourUnit(quiet)).toBeCloseTo(1 - 40 / 60, 6);
    expect(at('detail').colourUnit(quiet)).toBeCloseTo(1 - 40 / 80, 6);
    // Below the range: the floor colour.
    expect(at('balanced').colourUnit(even.maxAmp / 10000)).toBe(0);
    for (const spread of ['even', 'balanced', 'detail'] as const) {
      expect(at(spread).yOfAmp(quiet)).toBeCloseTo(even.yOfAmp(quiet), 9);
      expect(at(spread).colourUnit(even.maxAmp)).toBeCloseTo(1, 9);
    }
  });

  it('inverts for the legend', () => {
    for (const spread of ['even', 'balanced', 'detail'] as const) {
      const m = at(spread);
      for (const a of [m.maxAmp / 200, m.maxAmp / 10, m.maxAmp]) {
        expect(m.ampOfColourUnit(m.colourUnit(a))).toBeCloseTo(a, 6);
      }
    }
    expect(at('balanced').ampOfColourUnit(0)).toBeCloseTo(at('even').maxAmp / 1000, 9);
  });

  it('leaves the log scale alone: its colour follows its height', () => {
    const log = at('detail', 'log');
    const a = log.maxAmp * 0.01;
    expect(log.colourUnit(a)).toBeCloseTo(log.unit(a), 9);
  });
});

describe('frequency window', () => {
  it('draws only the lines inside the frequency window, when it holds two', () => {
    const spec = coastDown(4, 16, { row: 0, bin: 5, amp: 7 });
    const m = buildModel(spec, {
      scale: 'linear',
      height: 1,
      rpmFilter: null,
      freqFilter: { min: 40, max: 80 },
    });
    expect(m.freq).toEqual([40, 50, 60, 70, 80]);
    expect(m.nBins).toBe(5);
    expect(m.rows[m.nRows - 1][1]).toBe(7);
    const all = buildModel(spec, {
      scale: 'linear',
      height: 1,
      rpmFilter: null,
      freqFilter: { min: 41, max: 42 },
    });
    expect(all.nBins).toBe(16);
  });

  it('takes the first and last line inside the window, or all of them', () => {
    const axis = [0, 10, 20, 30, 40];
    expect(freqWindow(axis, null)).toEqual([0, 4]);
    expect(freqWindow(axis, { min: 5, max: 31 })).toEqual([1, 3]);
    expect(freqWindow(axis, { min: 5, max: 15 })).toEqual([0, 4]);
    expect(freqWindow([], null)).toEqual([0, -1]);
  });
});

describe('model steps', () => {
  it('keeps the layout when only the height changes', () => {
    const spec = coastDown(6, 8, { row: 2, bin: 3, amp: 9 });
    const low = buildModel(spec, { scale: 'linear', height: 0.5, rpmFilter: null });
    const high = buildModel(spec, { scale: 'linear', height: 2, rpmFilter: null });
    expect(high.rowZ).toEqual(low.rowZ);
    expect(high.yOfAmp(9)).toBeCloseTo(4 * low.yOfAmp(9));
    expect(high.colourUnit(4)).toBe(low.colourUnit(4));
  });

  it('lays out the data without the amplitude options', () => {
    const data = buildData(coastDown(), { rpmFilter: null, freqFilter: null });
    const model = buildModel(coastDown(), { scale: 'log', height: 1, rpmFilter: null });
    expect(data.rpm).toEqual(model.rpm);
    expect(data.maxAmp).toBe(model.maxAmp);
  });
});
