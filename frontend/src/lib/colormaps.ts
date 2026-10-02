// Colour schemes for amplitude surfaces: the 3D waterfall and its top view,
// the dashboard thumbnails and the sign-in backdrop.
//
// A scheme is one colour path with a variant per theme, built so that zero
// vibration recedes into the background and magnitude reads as contrast:
// on the dark theme the floor is dark and peaks are bright, on the light
// theme the floor is pale and peaks are dark. Viridis and Magma are the
// perceptually uniform scientific maps; Ocean, Teal (the app's accent) and
// Graphite are single-hue ramps. Every variant is lightness-monotonic
// (colormaps.test.ts checks this and the contrast against each canvas).
//
// The stops are sRGB, as CSS draws them (legend, swatches). WebGL shading
// works in linear light, so the 3D surface takes the same colours decoded
// (colormap(…, 'linear')); fed the sRGB values, it would render them
// lighter and paler than the legend, and the checks above would not hold.
import type { ColormapId } from '../api/types';
import type { ResolvedTheme } from './theme';

export type { ColormapId };

export const COLORMAPS: ColormapId[] = ['viridis', 'magma', 'ocean', 'teal', 'graphite'];

export const DEFAULT_COLORMAP: ColormapId = 'viridis';

/** Stops from zero (first) to the maximum (last), evenly spaced. */
export const COLORMAP_STOPS: Record<ColormapId, Record<ResolvedTheme, string[]>> = {
  viridis: {
    dark: [
      '#440154',
      '#482475',
      '#414487',
      '#355f8d',
      '#2a788e',
      '#21918c',
      '#22a884',
      '#44bf70',
      '#7ad151',
      '#bddf26',
      '#fde725',
    ],
    // Reversed, with a pale lead-in so the floor sits on the light canvas.
    light: [
      '#f7f9e9',
      '#e9f0a9',
      '#bddf26',
      '#7ad151',
      '#44bf70',
      '#22a884',
      '#21918c',
      '#2a788e',
      '#355f8d',
      '#414487',
      '#482475',
      '#440154',
    ],
  },
  magma: {
    dark: [
      '#000004',
      '#140e36',
      '#3b0f70',
      '#641a80',
      '#8c2981',
      '#b73779',
      '#de4968',
      '#f7705c',
      '#fe9f6d',
      '#fecf92',
      '#fcfdbf',
    ],
    light: [
      '#fffdf0',
      '#fcfdbf',
      '#fecf92',
      '#fe9f6d',
      '#f7705c',
      '#de4968',
      '#b73779',
      '#8c2981',
      '#641a80',
      '#3b0f70',
      '#140e36',
    ],
  },
  ocean: {
    dark: [
      '#0b1220',
      '#0f213f',
      '#15325f',
      '#1c4683',
      '#2a5fa8',
      '#3a7fd3',
      '#5b9bea',
      '#8dbcf3',
      '#cfe2fb',
    ],
    light: [
      '#f4f8fd',
      '#dbe8f9',
      '#b7d2f3',
      '#86b6ef',
      '#5598e7',
      '#2a78d6',
      '#1f5fae',
      '#174785',
      '#0f305c',
    ],
  },
  teal: {
    dark: [
      '#041417',
      '#06262d',
      '#073a45',
      '#0b5566',
      '#0e7490',
      '#0891b2',
      '#22d3ee',
      '#7ce8f6',
      '#d9fbfe',
    ],
    light: [
      '#f1fbfc',
      '#d3f3f7',
      '#a6e6ef',
      '#67d3e3',
      '#22b8d0',
      '#0891b2',
      '#0e7490',
      '#0b5a70',
      '#083344',
    ],
  },
  graphite: {
    dark: [
      '#0c0c10',
      '#1b1b21',
      '#2b2b33',
      '#3e3e48',
      '#55555f',
      '#70707c',
      '#8f8f9b',
      '#b4b4be',
      '#e6e6ec',
    ],
    light: [
      '#f6f7f9',
      '#e3e5ea',
      '#c8ccd4',
      '#a7adb8',
      '#868d9a',
      '#666d7b',
      '#4a505d',
      '#2f343f',
      '#171a21',
    ],
  },
};

export type RGB = [number, number, number];

/** How a sampler's rgb is encoded: 'srgb' as CSS and 2D canvases take it,
 *  'linear' (linear-light sRGB) as three.js takes vertex colours. */
export type ColourSpace = 'srgb' | 'linear';

/** '#rrggbb' → rgb 0–1. */
export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** One sRGB component (0–1) decoded to linear light: the sRGB transfer
 *  function, as three.js applies it to colours it is told are sRGB. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const LUT_SIZE = 256;
const luts = new Map<string, Float32Array>();

/** 256 interpolated colours (rgb 0–1, flat) for a scheme and theme. */
function lut(id: ColormapId, theme: ResolvedTheme): Float32Array {
  const key = `${id}:${theme}`;
  let table = luts.get(key);
  if (!table) {
    const stops = stopsOf(id, theme).map(hexToRgb);
    table = new Float32Array(LUT_SIZE * 3);
    for (let i = 0; i < LUT_SIZE; i++) {
      const x = (i / (LUT_SIZE - 1)) * (stops.length - 1);
      const lo = Math.floor(x);
      const hi = Math.min(stops.length - 1, lo + 1);
      const f = x - lo;
      for (let c = 0; c < 3; c++) {
        table[i * 3 + c] = stops[lo][c] + (stops[hi][c] - stops[lo][c]) * f;
      }
    }
    luts.set(key, table);
  }
  return table;
}

/** The same 256 colours in linear light. Decoded after interpolating, not
 *  before: the legend's CSS gradient interpolates in sRGB, so this way the
 *  surface shows its in-between shades too. */
function linearLut(id: ColormapId, theme: ResolvedTheme): Float32Array {
  const key = `${id}:${theme}:linear`;
  let table = luts.get(key);
  if (!table) {
    table = lut(id, theme).map(srgbToLinear);
    luts.set(key, table);
  }
  return table;
}

/** Sampler for a scheme: t in [0, 1] (0 = no vibration) → rgb 0–1, sRGB
 *  unless `space` asks for linear light (see ColourSpace). */
export function colormap(
  id: ColormapId,
  theme: ResolvedTheme,
  space: ColourSpace = 'srgb',
): (t: number) => RGB {
  const table = space === 'linear' ? linearLut(id, theme) : lut(id, theme);
  return (t) => {
    const i = Math.round(Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (LUT_SIZE - 1)) * 3;
    return [table[i], table[i + 1], table[i + 2]];
  };
}

/** CSS gradient of a scheme from zero to maximum: left to right for the
 *  swatches, bottom to top for the colour legend. */
export function colormapGradient(
  id: ColormapId,
  theme: ResolvedTheme,
  direction: 'to right' | 'to top' = 'to right',
): string {
  return `linear-gradient(${direction}, ${stopsOf(id, theme).join(', ')})`;
}

export function isColormapId(value: unknown): value is ColormapId {
  return typeof value === 'string' && (COLORMAPS as string[]).includes(value);
}

/** A scheme's colour stops for a theme. An unknown id (say, a stale stored
 *  setting) gets the default scheme. */
function stopsOf(id: ColormapId, theme: ResolvedTheme): string[] {
  return COLORMAP_STOPS[isColormapId(id) ? id : DEFAULT_COLORMAP][theme];
}
