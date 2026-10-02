// The point under the cursor on the waterfall. Kept in its own store so a
// pointer move re-renders only what shows it (tooltip, slice), never the
// whole scene or the workspace around it.
import { create } from 'zustand';

import type { WaterfallModel } from './model';

export interface HoverPoint {
  /** Row / bin of the waterfall model (rows sorted by rpm). */
  row: number;
  bin: number;
  /** The same row's index in the spectrogram (see WaterfallModel.specRow). */
  specRow: number;
  freqHz: number;
  rpm: number;
  amp: number;
}

/** The reading at a picked cell of the model. */
export function hoverAt(model: WaterfallModel, hit: { row: number; bin: number }): HoverPoint {
  return {
    row: hit.row,
    bin: hit.bin,
    specRow: model.specRow[hit.row],
    freqHz: model.freq[hit.bin],
    rpm: model.rpm[hit.row],
    amp: model.rows[hit.row][hit.bin] ?? 0,
  };
}

export const useHoverStore = create<{
  hover: HoverPoint | null;
  setHover: (h: HoverPoint | null) => void;
}>((set, get) => ({
  hover: null,
  setHover: (h) => {
    const cur = get().hover;
    if (cur === h) return;
    // A move within the same cell keeps the state, so nothing re-renders.
    if (cur && h && cur.row === h.row && cur.bin === h.bin && cur.rpm === h.rpm) return;
    set({ hover: h });
  },
}));
