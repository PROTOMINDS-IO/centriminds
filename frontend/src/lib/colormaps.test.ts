import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  COLORMAPS,
  COLORMAP_STOPS,
  DEFAULT_COLORMAP,
  colormap,
  colormapGradient,
  isColormapId,
  type ColormapId,
  type RGB,
} from './colormaps';
import type { ResolvedTheme } from './theme';

/** The 3D canvas (ink-900) in each theme: the surface floor sits on it. */
const CANVAS: Record<ResolvedTheme, string> = { dark: '#08080b', light: '#f7f8fa' };

const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** OKLab lightness, 0–1. */
function lightness([r, g, b]: RGB): number {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** WCAG contrast ratio. */
function contrast(a: RGB, b: RGB): number {
  const lum = ([r, g, bl]: RGB) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(bl);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('surface colour schemes', () => {
  for (const id of COLORMAPS) {
    for (const theme of ['dark', 'light'] as const) {
      const stops = COLORMAP_STOPS[id][theme].map(hex);
      const canvas = hex(CANVAS[theme]);

      it(`${id} (${theme}): magnitude reads as contrast with the canvas`, () => {
        // Lightness moves away from the canvas, step by step, never back.
        const ls = stops.map(lightness);
        for (let i = 1; i < ls.length; i++) {
          if (theme === 'dark') expect(ls[i], `stop ${i}`).toBeGreaterThan(ls[i - 1]);
          else expect(ls[i], `stop ${i}`).toBeLessThan(ls[i - 1]);
        }
        // Zero vibration recedes into the canvas; the maximum stands out.
        expect(contrast(stops[0], canvas)).toBeLessThan(1.5);
        expect(contrast(stops[stops.length - 1], canvas)).toBeGreaterThan(3);
      });
    }
  }

  it('samples the ends and clamps out-of-range input', () => {
    const sample = colormap('ocean', 'light');
    const first = hex(COLORMAP_STOPS.ocean.light[0]);
    const last = hex(COLORMAP_STOPS.ocean.light.at(-1)!);
    expect(sample(0)).toEqual(first.map((c) => expect.closeTo(c, 5)));
    expect(sample(1)).toEqual(last.map((c) => expect.closeTo(c, 5)));
    expect(sample(-3)).toEqual(sample(0));
    expect(sample(7)).toEqual(sample(1));
    expect(sample(Number.NaN)).toEqual(sample(0));
  });

  it('gives WebGL the same colours in linear light, decoded as three.js does', () => {
    // The 3D surface hands the linear samples to three.js as vertex colours,
    // and it encodes its output to sRGB: they show as the legend draws them.
    const decoded = new THREE.Color();
    for (const id of COLORMAPS) {
      for (const theme of ['dark', 'light'] as const) {
        const [srgb, lin] = [colormap(id, theme), colormap(id, theme, 'linear')];
        for (let k = 0; k <= 32; k++) {
          const [r, g, b] = srgb(k / 32);
          decoded.setRGB(r, g, b, THREE.SRGBColorSpace);
          const want = [decoded.r, decoded.g, decoded.b].map((c) => expect.closeTo(c, 6));
          expect(lin(k / 32), `${id} (${theme}) at ${k}/32`).toEqual(want);
        }
      }
    }
  });

  it('draws swatches and recognises ids', () => {
    expect(colormapGradient('magma', 'dark')).toMatch(/^linear-gradient\(to right, #000004/);
    expect(colormapGradient('magma', 'dark', 'to top')).toMatch(/^linear-gradient\(to top, /);
    expect(isColormapId('teal')).toBe(true);
    expect(isColormapId('rainbow')).toBe(false);
  });

  it('falls back to the default scheme for an unknown id', () => {
    const stale = 'rainbow' as ColormapId;
    expect(colormapGradient(stale, 'light')).toBe(colormapGradient(DEFAULT_COLORMAP, 'light'));
    expect(colormap(stale, 'dark')(0.5)).toEqual(colormap(DEFAULT_COLORMAP, 'dark')(0.5));
  });
});
