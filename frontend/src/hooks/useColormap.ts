import { useMemo } from 'react';

import { colormap, type ColourSpace, type RGB } from '../lib/colormaps';
import { useResolvedTheme } from '../lib/theme';
import { useSettingsStore } from '../store/settingsStore';

/** The user's surface colour scheme, in its variant for the theme in effect:
 *  t in [0, 1] (0 = no vibration) → rgb 0–1, sRGB unless `space` asks for
 *  linear light (WebGL vertex colours). Stable until the scheme, the theme
 *  or `space` changes. */
export function useColormap(space: ColourSpace = 'srgb'): (t: number) => RGB {
  const id = useSettingsStore((s) => s.colormap);
  const theme = useResolvedTheme();
  return useMemo(() => colormap(id, theme, space), [id, theme, space]);
}
