// Colours of the 3D scene, one palette per theme. WebGL cannot read the CSS
// tokens, so the scene picks a palette with useResolvedTheme(); the values
// mirror index.css where a token exists (background = ink-900, labels =
// ink-200/300, FE modes = --color-mode, level labels = --color-zone-*-text).
//
// The surface takes the user's colour scheme in the theme's variant
// (lib/colormaps.ts): a dark floor on the dark theme, a pale one on the
// light theme. What is drawn on it (the hovered row, the line waterfall) is
// therefore light on dark and dark on light. The alarm/shutdown planes keep
// the fixed status colours (lib/severity.ts); a machine's components take
// lib/sources.ts sourceColour(), the user's annotations annotationColour().
import { useResolvedTheme, type ResolvedTheme } from '../../lib/theme';

export interface ScenePalette {
  /** Behind the scene (ink-900); the canvas itself is transparent over it.
   *  Not drawn from here; the readability contrasts (palette.test.ts) are
   *  measured against it. */
  background: string;
  /** Floor outline and amplitude axis. */
  axis: string;
  axisOpacity: number;
  /** Tick marks. */
  tick: string;
  /** Tick labels. */
  text: string;
  /** Axis titles. */
  textMuted: string;
  /** Outline around every label, so it stays readable over the surface. */
  halo: string;
  /** The hovered speed's spectrum across the surface, and the point marker. */
  hoverLine: string;
  hoverPoint: string;
  /** Line waterfall drawn on the surface. */
  spectrumLines: string;
  spectrumLinesOpacity: number;
  /** FE structural modes. */
  mode: string;
  /** Resonance zones (suggested and known). */
  band: string;
  /** Speed-independent lines nothing explains. */
  stationary: string;
  /** Labels of the alarm and shutdown planes. */
  alarmText: string;
  shutdownText: string;
  /** User markers, by colour slot; each at least 3:1 against the background. */
  markers: readonly string[];
  /** Light intensities. The surface is matt (Lambert): a patch shows its
   *  scheme colour × the light it receives / π, each directional light
   *  counting by the cosine of its angle to the patch (LIGHT_POSITIONS). On
   *  an upward-facing patch, such as the floor, the lights sum to π, so it
   *  shows the legend's colours; slopes turned away from the key get less,
   *  which shows depth. About half is ambient, so shaded sides keep their
   *  colour. The top view is drawn unlit (Waterfall3D.tsx). */
  lights: { ambient: number; key: number; fill: number };
}

type Vec3 = [number, number, number];

/** Where the directional lights shine from (toward the origin), in both
 *  themes: the key from the default camera's side and above it, the fill
 *  from the far side. */
export const LIGHT_POSITIONS: { key: Vec3; fill: Vec3 } = {
  key: [4, 6, 4],
  fill: [-4, 4, -4],
};

export const PALETTES: Record<ResolvedTheme, ScenePalette> = {
  dark: {
    background: '#08080b',
    axis: '#475569',
    axisOpacity: 0.6,
    tick: '#9b9ba6',
    text: '#c8c8ce',
    textMuted: '#9b9ba6',
    halo: '#04040a',
    hoverLine: '#f8fafc',
    hoverPoint: '#ffffff',
    spectrumLines: '#e7e7ea',
    spectrumLinesOpacity: 0.45,
    mode: '#f472b6',
    band: '#a78bfa',
    stationary: '#fbbf24',
    alarmText: '#f4ae92',
    shutdownText: '#f08c8c',
    markers: ['#a78bfa', '#f97316', '#10b981', '#60a5fa', '#e879f9', '#facc15'],
    lights: { ambient: 1.6, key: 1.6, fill: 0.66 },
  },
  light: {
    background: '#f7f8fa',
    axis: '#64748b',
    axisOpacity: 0.6,
    tick: '#737885',
    text: '#353945',
    textMuted: '#585d6b',
    halo: '#f7f8fa',
    hoverLine: '#1b1e26',
    hoverPoint: '#0b0d12',
    spectrumLines: '#1b1e26',
    spectrumLinesOpacity: 0.3,
    mode: '#be185d',
    band: '#6d28d9',
    stationary: '#a16207',
    alarmText: '#9c3f17',
    shutdownText: '#a82020',
    // The dark theme's hues, stepped down to stay readable on #f7f8fa.
    markers: ['#7c3aed', '#c2410c', '#047857', '#2563eb', '#a21caf', '#a16207'],
    lights: { ambient: 1.65, key: 1.65, fill: 0.5 },
  },
};

/** Colour of a marker's slot in the given theme (slots beyond the list cycle). */
export function markerColour(slot: number, theme: ResolvedTheme): string {
  const list = PALETTES[theme].markers;
  return list[((slot % list.length) + list.length) % list.length];
}

/** An annotation's colour: a palette slot ("slot:2", following the theme) or
 *  a fixed #rrggbb. */
export function annotationColour(color: string, theme: ResolvedTheme): string {
  const slot = /^slot:(\d+)$/.exec(color);
  if (slot) return markerColour(Number(slot[1]), theme);
  return /^#[0-9a-f]{6}$/i.test(color) ? color : markerColour(0, theme);
}

/** The palette of the theme in effect (re-renders when it changes). */
export function useScenePalette(): ScenePalette {
  return PALETTES[useResolvedTheme()];
}
