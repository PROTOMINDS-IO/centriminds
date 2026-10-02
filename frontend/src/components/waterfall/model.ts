// Layout of the waterfall in world space, shared by every layer so the
// surface, the pointer picking, the axes and all overlays agree exactly.
//
//   x ∈ [-1, 1]  frequency, linear, left → right
//   z ∈ [-1, 1]  speed, linear in rpm: slowest row in front (+1), fastest at
//                the back (-1) — rows are sorted by rpm, whatever order the
//                sweep was recorded in (run-up or coast-down)
//   y ∈ [0, h]   amplitude, linear or log (dB below the highest amplitude
//                shown); h = the user's height scale, flattened in the top view
import type { ColourSpread, SpectrogramRead } from '../../api/types';
import type { AmpScaleMode } from '../../store/uiStore';

/** Half the side of the square floor (world units): x and z span ±HALF. */
export const HALF = 1;

/** Dynamic range of the log scale, in dB below the highest amplitude shown. */
const LOG_RANGE_DB = 50;

/** Colour spread on the linear scale. Spectra are extremely skewed (most
 *  lines sit 60–80 dB below the peak), so "balanced" and "detail" colour
 *  logarithmically over this many dB below the highest amplitude shown:
 *  small waves and their peaks take a real part of the colour scheme while
 *  heights stay true. "even" colours in proportion to the amplitude. On the
 *  log scale the colour follows the (already logarithmic) height as it is. */
const SPREAD_RANGE_DB: Record<ColourSpread, number | null> = {
  even: null,
  balanced: 60,
  detail: 80,
};

/** The rows and lines a spectrogram shows under the current filters, laid
 *  out on the floor. Independent of the amplitude scale and the height, so
 *  the expensive part (slicing and sorting the matrix) is only redone when
 *  the data or a filter changes. */
export interface WaterfallData {
  nBins: number;
  nRows: number;
  /** Frequency of each bin (Hz). */
  freq: number[];
  /** Speed of each row (rpm), ascending. */
  rpm: number[];
  /** Index of each row in the spectrogram (before sorting and filtering).
   *  Speeds can repeat, so the speed alone does not identify a row. */
  specRow: number[];
  /** Amplitude (mm/s), rows in `rpm` order. */
  rows: number[][];
  freqMin: number;
  freqMax: number;
  rpmMin: number;
  rpmMax: number;
  /** Highest amplitude of the rows shown (mm/s), the top of the scale; 1
   *  when there is no signal. */
  maxAmp: number;
  /** World z of each row. */
  rowZ: Float64Array;
  xOfFreq: (hz: number) => number;
  /** World x of a frequency bin (bins are evenly spaced). */
  xOfBin: (bin: number) => number;
  /** World z of a speed. When all rows shown share one speed they are laid
   *  out by index, and every speed maps to the middle (0). */
  zOfRpm: (rpm: number) => number;
  /** Fractional row position for world z (rows are not evenly spaced). */
  rowAtZ: (z: number) => number;
}

/** How amplitude maps to the 0..1 of the height and of the colour scheme. */
export interface AmpScale {
  scale: AmpScaleMode;
  /** Amplitude → 0..1 on the active scale. */
  unit: (amp: number) => number;
  /** Inverse of `unit`, for axis ticks. */
  ampOfUnit: (u: number) => number;
  /** Amplitude → 0..1 position in the colour scheme (see SPREAD_RANGE_DB). */
  colourUnit: (amp: number) => number;
  /** Inverse of `colourUnit`, for the colour legend. */
  ampOfColourUnit: (t: number) => number;
}

export interface WaterfallModel extends WaterfallData, AmpScale {
  /** World y of `maxAmp`. */
  height: number;
  yOfAmp: (amp: number) => number;
}

/** Display options of the waterfall: what `buildModel` takes. */
export interface ModelOptions {
  scale: AmpScaleMode;
  height: number;
  rpmFilter: { min: number; max: number } | null;
  /** Only the lines within it (all if fewer than two would be left). */
  freqFilter?: { min: number; max: number } | null;
  /** Colour spread on the linear scale (ignored on the log scale). */
  spread?: ColourSpread;
}

/** The waterfall of a spectrogram for the current display options: the rows
 *  inside the speed filter (all of them if none is), sorted by speed, and
 *  the lines inside the frequency window, with amplitude mapped to height
 *  and to colour. The three steps apart, for callers that keep each one
 *  while only a later option changes (Waterfall3D). */
export function buildModel(spec: SpectrogramRead, opts: ModelOptions): WaterfallModel {
  const data = buildData(spec, opts);
  return placeModel(data, ampScale(data, opts.scale, opts.spread), opts.height);
}

/** First and last index of the frequency window in `axis` (ascending): the
 *  lines within `filter`, or all of them if it holds fewer than two. */
export function freqWindow(
  axis: number[],
  filter: { min: number; max: number } | null | undefined,
): [number, number] {
  if (filter) {
    const inside = axis.flatMap((f, j) => (f >= filter.min && f <= filter.max ? [j] : []));
    if (inside.length >= 2) return [inside[0], inside[inside.length - 1]];
  }
  return [0, axis.length - 1];
}

/** The rows inside the speed filter, sorted by speed, and the lines inside
 *  the frequency window, laid out on the floor. */
export function buildData(
  spec: SpectrogramRead,
  opts: Pick<ModelOptions, 'rpmFilter' | 'freqFilter'>,
): WaterfallData {
  const order: number[] = [];
  spec.ref_speeds.forEach((r, i) => {
    if (!opts.rpmFilter || (r >= opts.rpmFilter.min && r <= opts.rpmFilter.max)) order.push(i);
  });
  // An empty filter window would leave nothing to draw — show everything.
  if (order.length === 0) spec.ref_speeds.forEach((_, i) => order.push(i));
  order.sort((a, b) => spec.ref_speeds[a] - spec.ref_speeds[b] || a - b);

  const [b0, b1] = freqWindow(spec.freq_axis, opts.freqFilter);
  const rpm = order.map((i) => spec.ref_speeds[i]);
  const rows = order.map((i) => (spec.z_matrix[i] ?? []).slice(b0, b1 + 1));
  const freq = spec.freq_axis.slice(b0, b1 + 1);
  const nBins = freq.length;
  const nRows = rows.length;

  let maxAmp = 0;
  for (const row of rows) for (const v of row) if (v > maxAmp) maxAmp = v;
  if (!(maxAmp > 0)) maxAmp = 1;

  const freqMin = freq[0] ?? 0;
  const freqMax = freq[nBins - 1] ?? 1;
  const rpmMin = rpm[0] ?? 0;
  const rpmMax = rpm[nRows - 1] ?? 1;
  const rpmSpan = rpmMax - rpmMin;
  // A constant-speed recording has no rpm spread: lay rows out by index.
  const byIndex = rpmSpan < 1e-6;

  const rowZ = new Float64Array(nRows);
  for (let r = 0; r < nRows; r++) {
    const t = byIndex ? r / Math.max(1, nRows - 1) : (rpm[r] - rpmMin) / rpmSpan;
    rowZ[r] = HALF - t * 2 * HALF;
  }

  const xOfFreq = (hz: number) =>
    -HALF + ((hz - freqMin) / Math.max(1e-9, freqMax - freqMin)) * 2 * HALF;
  const zOfRpm = (r: number) => (byIndex ? 0 : HALF - ((r - rpmMin) / rpmSpan) * 2 * HALF);

  function rowAtZ(z: number): number {
    // rowZ is descending from +HALF (row 0) to -HALF (last row).
    if (nRows < 2) return 0;
    if (z >= rowZ[0]) return 0;
    if (z <= rowZ[nRows - 1]) return nRows - 1;
    let lo = 0;
    let hi = nRows - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rowZ[mid] > z) lo = mid;
      else hi = mid;
    }
    const span = rowZ[lo] - rowZ[hi];
    return span > 0 ? lo + (rowZ[lo] - z) / span : lo;
  }

  return {
    nBins,
    nRows,
    freq,
    rpm,
    specRow: order,
    rows,
    freqMin,
    freqMax,
    rpmMin,
    rpmMax,
    maxAmp,
    rowZ,
    xOfFreq,
    xOfBin: (b) => -HALF + (b / Math.max(1, nBins - 1)) * 2 * HALF,
    zOfRpm,
    rowAtZ,
  };
}

/** Amplitude on the linear or log scale, and in the colour scheme. */
export function ampScale(
  data: Pick<WaterfallData, 'maxAmp'>,
  scale: AmpScaleMode,
  spread: ColourSpread = 'even',
): AmpScale {
  const { maxAmp } = data;
  const logFloor = maxAmp * 10 ** (-LOG_RANGE_DB / 20);
  const unit =
    scale === 'log'
      ? (a: number) =>
          a <= logFloor ? 0 : Math.min(1, 1 + (20 * Math.log10(a / maxAmp)) / LOG_RANGE_DB)
      : (a: number) => Math.max(0, Math.min(1, a / maxAmp));
  const ampOfUnit =
    scale === 'log'
      ? (u: number) => maxAmp * 10 ** (((u - 1) * LOG_RANGE_DB) / 20)
      : (u: number) => u * maxAmp;
  const rangeDb = scale === 'log' ? null : SPREAD_RANGE_DB[spread];
  const colourFloor = rangeDb === null ? 0 : maxAmp * 10 ** (-rangeDb / 20);
  const colourUnit =
    rangeDb === null
      ? unit
      : (a: number) =>
          a <= colourFloor ? 0 : Math.min(1, 1 + (20 * Math.log10(a / maxAmp)) / rangeDb);
  const ampOfColourUnit =
    rangeDb === null
      ? ampOfUnit
      : (t: number) => maxAmp * 10 ** (((Math.max(0, Math.min(1, t)) - 1) * rangeDb) / 20);
  return { scale, unit, ampOfUnit, colourUnit, ampOfColourUnit };
}

/** The model at a height: cheap, so the height slider redoes only this. */
export function placeModel(data: WaterfallData, amp: AmpScale, height: number): WaterfallModel {
  return { ...data, ...amp, height, yOfAmp: (a) => amp.unit(a) * height };
}
