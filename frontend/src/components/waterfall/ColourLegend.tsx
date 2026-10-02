// Colour legend of the waterfall: the colour scheme as a bar with amplitude
// ticks where each value falls, so the spread of the colours (see
// SPREAD_RANGE_DB in model.ts) can be read off. Bottom right of the free
// view, above the controls hint; gives way to the slice panel and stays off
// phones.
import { useMemo } from 'react';

import { useI18n } from '../../i18n';
import { colormapGradient } from '../../lib/colormaps';
import { useResolvedTheme } from '../../lib/theme';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import type { Insets } from './framing';
import { legendTicks, useLegendStore } from './legend';

export default function ColourLegend({ inset }: { inset: Insets }) {
  const { t, fmt } = useI18n();
  const scale = useLegendStore((s) => s.scale);
  const colormap = useSettingsStore((s) => s.colormap);
  const theme = useResolvedTheme();
  const slice = useUIStore((s) => s.showSlice);
  const ticks = useMemo(() => (scale ? legendTicks(scale) : []), [scale]);
  if (!scale || slice || ticks.length === 0) return null;

  const digits = (v: number) => (v === 0 || v >= 10 ? 0 : v >= 1 ? 1 : v >= 0.1 ? 2 : 3);
  const bar = colormapGradient(colormap, theme, 'to top');
  return (
    <figure
      className="float pointer-events-none absolute bottom-8 z-10 hidden animate-enter rounded-lg px-2.5 pt-2 pb-2.5 text-[10px] transition-[right] duration-250 ease-smooth md:block"
      style={{ right: 12 + inset.right }}
      aria-label={t('workspace.legend.label')}
    >
      <figcaption className="mb-2 font-medium text-ink-200">mm/s</figcaption>
      <div className="flex gap-2">
        <div className="h-28 w-2.5 rounded-sm ring-1 ring-edge/15" style={{ background: bar }} />
        <div className="relative h-28 w-9">
          {ticks.map((tick) => (
            <span
              key={tick.value}
              className="absolute left-0 translate-y-1/2 font-mono whitespace-nowrap text-ink-300 tabular-nums"
              style={{ bottom: `${tick.t * 100}%` }}
            >
              {/* The floor of a logarithmic scale means "this or less". */}
              {tick.t === 0 && tick.value > 0 ? '≤' : ''}
              {fmt.number(tick.value, digits(tick.value))}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
