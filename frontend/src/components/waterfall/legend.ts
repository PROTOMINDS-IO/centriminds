// The colour legend's scale. The 3D scene publishes it from its model; the
// legend (a DOM overlay outside the canvas) reads it, like the hover store.
import { create } from 'zustand';

import type { WaterfallModel } from './model';

export type LegendScale = Pick<WaterfallModel, 'maxAmp' | 'colourUnit' | 'ampOfColourUnit'>;

export const useLegendStore = create<{
  scale: LegendScale | null;
  setScale: (scale: LegendScale | null) => void;
}>((set) => ({
  scale: null,
  setScale: (scale) => set({ scale }),
}));

export interface LegendTick {
  /** Position on the colour bar, 0 (bottom) … 1 (top). */
  t: number;
  /** Amplitude, mm/s. */
  value: number;
}

/** Round amplitudes (…, 0.1, 0.2, 0.5, 1, 2, 5, …) placed where they fall in
 *  the colour scheme, plus the maximum and the bottom of the scale, never
 *  closer than `minGap`. Uneven spacing is the point: it shows how the
 *  colours spread. */
export function legendTicks(scale: LegendScale, minGap = 0.16): LegendTick[] {
  const { maxAmp, colourUnit } = scale;
  if (!(maxAmp > 0)) return [];
  const ticks: LegendTick[] = [{ t: 1, value: maxAmp }];
  const top = Math.floor(Math.log10(maxAmp));
  const candidates: number[] = [];
  for (let e = top; e >= top - 4; e--) {
    for (const m of [5, 2, 1]) {
      const v = m * 10 ** e;
      if (v < maxAmp * 0.95) candidates.push(v);
    }
  }
  for (const value of candidates) {
    const t = colourUnit(value);
    // Candidates descend, so every later one would sit lower still.
    if (t < minGap / 2) break;
    if (ticks.every((k) => Math.abs(k.t - t) >= minGap)) ticks.push({ t, value });
  }
  // The bottom: zero on a linear colour scale, the floor on a logarithmic one.
  if (ticks.every((k) => k.t >= minGap)) ticks.push({ t: 0, value: scale.ampOfColourUnit(0) });
  return ticks.sort((a, b) => a.t - b.t);
}
