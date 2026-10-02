import { describe, expect, it } from 'vitest';

import type { ResolvedTheme } from '../../lib/theme';
import { LIGHT_POSITIONS, PALETTES, annotationColour, markerColour } from './palette';

const HEX = /^#[0-9a-f]{6}$/;
const THEMES: ResolvedTheme[] = ['dark', 'light'];

type Vec3 = [number, number, number];

/** The factor a matt (Lambert) patch facing `normal` shows its colour at:
 *  the light it receives over π (1 = the colour itself). */
function brightness(theme: ResolvedTheme, normal: Vec3): number {
  const { ambient, key, fill } = PALETTES[theme].lights;
  const unit = (v: Vec3) => v.map((c) => c / Math.hypot(...v));
  const cos = (light: Vec3) => {
    const [l, n] = [unit(light), unit(normal)];
    return Math.max(0, l[0] * n[0] + l[1] * n[1] + l[2] * n[2]);
  };
  return (ambient + key * cos(LIGHT_POSITIONS.key) + fill * cos(LIGHT_POSITIONS.fill)) / Math.PI;
}

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('scene palettes', () => {
  it('define every colour for both themes', () => {
    expect(Object.keys(PALETTES.light).sort()).toEqual(Object.keys(PALETTES.dark).sort());
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(PALETTES[theme])) {
        if (typeof value === 'number') {
          expect(value, `${theme}.${key}`).toBeGreaterThan(0);
          expect(value, `${theme}.${key}`).toBeLessThanOrEqual(1);
        } else if (Array.isArray(value)) {
          for (const c of value) expect(c, `${theme}.${key}`).toMatch(HEX);
        } else if (key === 'lights') {
          for (const [light, intensity] of Object.entries(value)) {
            expect(intensity, `${theme}.lights.${light}`).toBeGreaterThan(0);
          }
        } else {
          expect(value, `${theme}.${key}`).toMatch(HEX);
        }
      }
    }
    expect(PALETTES.light.markers).toHaveLength(PALETTES.dark.markers.length);
  });

  it('match the page behind the canvas and the theme tokens', () => {
    expect(PALETTES.dark.background).toBe('#08080b'); // ink-900
    expect(PALETTES.light.background).toBe('#f7f8fa');
    expect(PALETTES.dark.mode).toBe('#f472b6'); // --color-mode
    expect(PALETTES.light.mode).toBe('#be185d');
  });

  it('keep labels, reference lines and markers readable on the background (3:1)', () => {
    for (const theme of THEMES) {
      const p = PALETTES[theme];
      const readable = [
        p.text,
        p.textMuted,
        p.tick,
        p.mode,
        p.band,
        p.stationary,
        p.alarmText,
        p.shutdownText,
      ];
      for (const c of [...readable, ...p.markers]) {
        expect(contrast(c, p.background), `${theme} ${c}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("light an upward-facing patch to the legend's colours and shade the slopes", () => {
    for (const theme of THEMES) {
      // An upward-facing patch, such as the floor, shows the scheme as it is.
      expect(brightness(theme, [0, 1, 0]), theme).toBeCloseTo(1, 2);
      // Facing the key light, a slope is not washed out beyond that…
      expect(brightness(theme, LIGHT_POSITIONS.key), theme).toBeLessThan(1.1);
      // …and a 45° slope turned away from it is visibly darker.
      expect(brightness(theme, [-1, Math.SQRT2, -1]), theme).toBeLessThan(0.8);
    }
  });

  it('give each marker slot its own colour, cycling after the last', () => {
    for (const theme of THEMES) {
      const n = PALETTES[theme].markers.length;
      expect(new Set(PALETTES[theme].markers).size).toBe(n);
      expect(markerColour(n + 2, theme)).toBe(markerColour(2, theme));
    }
    expect(markerColour(0, 'light')).not.toBe(markerColour(0, 'dark'));
  });

  it("take an annotation's slot or fixed colour", () => {
    expect(annotationColour('slot:3', 'dark')).toBe(markerColour(3, 'dark'));
    expect(annotationColour('slot:3', 'light')).toBe(markerColour(3, 'light'));
    expect(annotationColour('#12ab34', 'dark')).toBe('#12ab34');
    expect(annotationColour('red', 'dark')).toBe(markerColour(0, 'dark'));
  });
});
