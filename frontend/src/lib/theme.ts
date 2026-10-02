// Theme at runtime: resolves "system" against the OS setting and keeps
// <html data-theme> in sync (public/theme-init.js sets it before first
// paint). DOM code styles itself through the CSS tokens in index.css; code
// that cannot use CSS (the WebGL scene) picks a palette by useResolvedTheme().
import { useEffect, useSyncExternalStore } from 'react';

import { useSettingsStore, type ThemeSetting } from '../store/settingsStore';

export type ResolvedTheme = 'light' | 'dark';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.(LIGHT_QUERY).matches
    ? 'light'
    : 'dark';
}

function subscribeSystem(onChange: () => void) {
  const mq = window.matchMedia?.(LIGHT_QUERY);
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}

function resolveTheme(setting: ThemeSetting, system: ResolvedTheme): ResolvedTheme {
  return setting === 'system' ? system : setting;
}

/** The theme in effect now ('system' resolved), re-rendering on OS changes. */
export function useResolvedTheme(): ResolvedTheme {
  const setting = useSettingsStore((s) => s.theme);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => 'dark' as const);
  return resolveTheme(setting, system);
}

/** The page colour (ink-950), for <meta name="theme-color">. */
const THEME_COLOR: Record<ResolvedTheme, string> = { dark: '#04040a', light: '#eef0f3' };

/** Mounted once (main.tsx): applies the resolved theme to the document. */
export function ThemeSync() {
  const theme = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  return null;
}
