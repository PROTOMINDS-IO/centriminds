import { useId } from 'react';

import type { ThemeSetting } from '../../store/settingsStore';

interface Swatch {
  page: string;
  bar: string;
  card: string;
  line: string;
  text: string;
  accent: string;
}

// Theme colours outside index.css, on purpose: each card shows its own theme
// whatever the current one is, so it cannot use the tokens (they follow the
// current theme). Values mirror index.css.
const SWATCHES: Record<'dark' | 'light', Swatch> = {
  dark: {
    page: '#04040a',
    bar: '#08080b',
    card: '#111116',
    line: '#26262d',
    text: '#c8c8ce',
    accent: '#22d3ee',
  },
  light: {
    page: '#eef0f3',
    bar: '#f7f8fa',
    card: '#ffffff',
    line: '#d4d7de',
    text: '#585d6b',
    accent: '#0e7490',
  },
};

/** A tiny screen: top bar, a card with text lines and a button. */
function Screen({ c }: { c: Swatch }) {
  return (
    <>
      <rect width="120" height="68" fill={c.page} />
      <rect width="120" height="11" fill={c.bar} />
      <circle cx="8" cy="5.5" r="2.5" fill={c.accent} />
      <rect x="90" y="4" width="22" height="3" rx="1.5" fill={c.line} />
      <rect
        x="8"
        y="18"
        width="104"
        height="42"
        rx="4"
        fill={c.card}
        stroke={c.line}
        strokeWidth="0.75"
      />
      <rect x="15" y="25" width="44" height="4" rx="2" fill={c.text} />
      <rect x="15" y="34" width="72" height="3" rx="1.5" fill={c.line} />
      <rect x="15" y="41" width="56" height="3" rx="1.5" fill={c.line} />
      <rect x="84" y="47" width="21" height="7" rx="3.5" fill={c.accent} />
    </>
  );
}

/** Preview of a theme for its card in Settings; "system" shows both, split. */
export default function ThemePreview({ theme }: { theme: ThemeSetting }) {
  const clipId = `theme-split${useId()}`;
  return (
    <span className="block overflow-hidden rounded-md ring-1 ring-edge/10">
      <svg viewBox="0 0 120 68" className="block h-auto w-full" aria-hidden="true">
        {theme === 'system' ? (
          <>
            <Screen c={SWATCHES.dark} />
            <clipPath id={clipId}>
              <polygon points="74,0 120,0 120,68 46,68" />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              <Screen c={SWATCHES.light} />
            </g>
          </>
        ) : (
          <Screen c={SWATCHES[theme]} />
        )}
      </svg>
    </span>
  );
}
