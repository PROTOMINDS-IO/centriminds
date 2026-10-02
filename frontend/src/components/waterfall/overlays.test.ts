import { describe, expect, it } from 'vitest';

import type { AttributedPeak, OrderLine, ResonanceZone } from '../../api/types';
import { toWrite, EMPTY_DRAFT } from './annotationDraft';
import { buildModel } from './model';
import {
  ampAt,
  lineFreqAt,
  lineNear,
  linesShown,
  readingSource,
  staggered,
  surfacePath,
  userOrderFreq,
  zoneShown,
} from './overlays';
import { coastDown } from './testData';

function line(
  id: string,
  rpm: number[],
  freq: number[],
  kind: OrderLine['kind'] = 'mechanical',
): OrderLine {
  const members = id.split('+').map((m) => {
    const [component, order] = m.split('@');
    return { component, order: Number(order) };
  });
  return {
    id,
    members,
    kind,
    rpm,
    freq_hz: freq,
    peak_amp: 0,
    peak_rpm: 0,
    peak_freq_hz: 0,
  };
}

// Orders 1 and 3 of the bowl over 0–3000 rpm.
const bowl1 = line('bowl@1+scroll@1', [0, 3000], [0, 50]);
const bowl3 = line('bowl@3', [0, 3000], [0, 150]);

describe('analysis overlays', () => {
  it('shows the lines up to an order, unless all their components are hidden', () => {
    expect(linesShown([bowl1, bowl3], 2, []).map((l) => l.id)).toEqual(['bowl@1+scroll@1']);
    expect(linesShown([bowl1, bowl3], 3, ['bowl']).map((l) => l.id)).toEqual(['bowl@1+scroll@1']);
    expect(linesShown([bowl1, bowl3], 3, ['bowl', 'scroll'])).toEqual([]);
  });

  it('reads a line between its samples, and not beyond them', () => {
    expect(lineFreqAt(bowl1, 1500)).toBeCloseTo(25);
    expect(lineFreqAt(bowl1, 3001)).toBeNull();
  });

  it('finds the line a reading lies on', () => {
    expect(lineNear([bowl1, bowl3], 1500, 75.3, 0.5)?.id).toBe('bowl@3');
    expect(lineNear([bowl1, bowl3], 1500, 50, 0.5)).toBeNull();
  });

  it('names what a reading lies on: the nearest attributed peak, else a line', () => {
    // 0–150 Hz in 16 bins: 10 Hz apart, so a tolerance of 15 Hz.
    const model = { freqMin: 0, freqMax: 150, nBins: 16 };
    const peak = (freq_hz: number, source_id: string | null, rpm = 1500) =>
      ({ rpm, freq_hz, source_id, harmonic: 1, confidence: 0.9 }) as AttributedPeak;
    const near = peak(80, 'scroll');
    const peaks = [peak(60, 'bowl'), near, peak(76, null), peak(77, 'bowl', 2000)];
    expect(readingSource(model, peaks, [bowl3], { rpm: 1500, freqHz: 75 })).toEqual({
      kind: 'peak',
      peak: near,
    });
    // No attributed peak within reach at that speed: the line passing there.
    expect(readingSource(model, [], [bowl1, bowl3], { rpm: 1500, freqHz: 72 })).toEqual({
      kind: 'line',
      line: bowl3,
    });
    expect(readingSource(model, peaks, [bowl1], { rpm: 1000, freqHz: 120 })).toBeNull();
  });

  it('keeps the likely zones that matter, or all', () => {
    const zone = (confidence: number, relative_amplitude: number) =>
      ({ confidence, relative_amplitude }) as ResonanceZone;
    expect(zoneShown(zone(0.9, 0.5), 'strong')).toBe(true);
    expect(zoneShown(zone(0.5, 0.5), 'strong')).toBe(false);
    expect(zoneShown(zone(0.9, 0.03), 'strong')).toBe(false);
    expect(zoneShown(zone(0.1, 0.01), 'all')).toBe(true);
  });

  it('lays a line on the surface, one point per row, split where it leaves the range', () => {
    // Rows 250–3000 rpm, lines 0–150 Hz at 10 Hz spacing, a 7 mm/s peak at
    // row 0 (3000 rpm), bin 5 (50 Hz) — where the bowl's 1× is.
    const model = buildModel(coastDown(12, 16, { row: 0, bin: 5, amp: 7 }), {
      scale: 'linear',
      height: 1,
      rpmFilter: null,
    });
    expect(ampAt(model, model.nRows - 1, 50)).toBeCloseTo(7);
    expect(ampAt(model, model.nRows - 1, 45)).toBeCloseTo(4);
    const [path] = surfacePath(model, (rpm) => lineFreqAt(bowl1, rpm));
    expect(path).toHaveLength(model.nRows);
    const top = path[path.length - 1];
    expect(top[0]).toBeCloseTo(model.xOfFreq(50));
    expect(top[1]).toBeCloseTo(model.yOfAmp(7) + 0.008);
    // The 3rd order leaves the 0–150 Hz range above 3000 rpm only at its
    // end; one at 4× (200 Hz at 3000 rpm) is cut where it passes 150 Hz.
    const four = surfacePath(model, (rpm) => (4 * rpm) / 60);
    expect(four).toHaveLength(1);
    expect(four[0].length).toBeLessThan(model.nRows);
  });

  it("draws a user's order of the measured speed, or of a component", () => {
    expect(userOrderFreq({ payload: { order: 0.5 } }, undefined, 1200)).toBeCloseTo(10);
    // The scroll shares the bowl's merged 1× line but keeps its own speed
    // (n + 10 rpm) here.
    const physics = {
      peaks: [],
      order_lines: [bowl1],
      component_lines: { rpm: [0, 3000], freq_hz: { bowl: [0, 50], scroll: [10 / 60, 3010 / 60] } },
    };
    expect(userOrderFreq({ payload: { order: 2, component: 'bowl' } }, physics, 1500)).toBeCloseTo(
      50,
    );
    expect(
      userOrderFreq({ payload: { order: 3, component: 'scroll' } }, physics, 1500),
    ).toBeCloseTo((3 * 1510) / 60);
    expect(userOrderFreq({ payload: { order: 2, component: 'gone' } }, physics, 1500)).toBeNull();
  });
});

describe('label staggering', () => {
  it('lifts each crowded label a step above its neighbour, in any input order', () => {
    expect(staggered([0.5, 0, 0.05, 0.1, -1], 0.1, 1)).toEqual([0, 0, 1, 2, 0]);
    expect(staggered([], 0.1, 1)).toEqual([]);
  });
});

describe('annotation drafts', () => {
  it('keep a fixed colour until another is picked', () => {
    const fixed = { ...EMPTY_DRAFT, type: 'frequency_line' as const, freq: '50', color: '#12ab34' };
    expect(toWrite(fixed)?.color).toBe('#12ab34');
  });

  it('make a request once the values its type needs are there', () => {
    expect(toWrite({ ...EMPTY_DRAFT, type: 'band', freq: '62', freqEnd: '' })).toBeNull();
    expect(toWrite({ ...EMPTY_DRAFT, type: 'band', freq: '78', freqEnd: '62' })).toBeNull();
    expect(
      toWrite({
        ...EMPTY_DRAFT,
        type: 'band',
        freq: '62',
        freqEnd: '78',
        label: ' Zone ',
        color: 'slot:2',
      }),
    ).toEqual({
      annotation_type: 'band',
      freq_hz: 62,
      freq_hz_end: 78,
      label: 'Zone',
      color: 'slot:2',
    });
    // A speed range only when both ends are given, in order.
    expect(
      toWrite({
        ...EMPTY_DRAFT,
        type: 'band',
        freq: '62',
        freqEnd: '78',
        rpm: '900',
        rpmEnd: '1500',
      }),
    ).toMatchObject({ rpm: 900, rpm_end: 1500 });
    expect(toWrite({ ...EMPTY_DRAFT, type: 'note', freq: '50', rpm: '' })).toBeNull();
    expect(
      toWrite({ ...EMPTY_DRAFT, type: 'note', freq: '50', rpm: '1500', text: ' Mains ' }),
    ).toMatchObject({
      freq_hz: 50,
      rpm: 1500,
      text: 'Mains',
    });
    expect(toWrite({ ...EMPTY_DRAFT, type: 'order_line', order: '0' })).toBeNull();
    expect(toWrite({ ...EMPTY_DRAFT, type: 'order_line', order: '0.5' })).toMatchObject({
      order: 0.5,
      component: null,
    });
    expect(toWrite({ ...EMPTY_DRAFT, type: 'speed_line', rpm: 'abc' })).toBeNull();
  });
});
