// 2D spectrum at one speed — the hovered row of the waterfall, or a pinned
// speed when the pointer is elsewhere. Auto-scaled per row so quiet speeds
// stay readable; the frequency under the cursor is marked. Floats at the
// bottom of the view, centred in the room the expanded cards leave free.
import { useMemo, useState } from 'react';

import type { SpectrogramRead } from '../../api/types';
import { usePresence } from '../../hooks/usePresence';
import { useI18n } from '../../i18n';
import { niceTicks, ticksReaching } from '../../lib/ticks';
import { useUIStore } from '../../store/uiStore';
import { CloseButton } from '../ui/controls';
import { NO_INSETS, type Insets } from './framing';
import { useHoverStore } from './hover';
import { freqWindow } from './model';

/** The plot's coordinate space (the SVG scales it to the panel's width) and
 *  the room kept around it for the axis labels. */
const W = 520;
const H = 150;
const PAD = { l: 34, r: 10, t: 10, b: 24 };
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;
/** Distance from the view's edges (bottom-3 and the side margins). */
const MARGIN_PX = 12;

export default function SlicePanel({
  spectrogram,
  inset = NO_INSETS,
}: {
  spectrogram: SpectrogramRead;
  /** Room covered by expanded cards; the panel centres in what is left. */
  inset?: Insets;
}) {
  const { t, fmt } = useI18n();
  const show = useUIStore((s) => s.showSlice);
  const toggle = useUIStore((s) => s.toggleSlice);
  const hover = useHoverStore((s) => s.hover);

  // Row indices sorted by speed, for the pin slider.
  const order = useMemo(
    () =>
      spectrogram.ref_speeds
        .map((_, i) => i)
        .sort((a, b) => spectrogram.ref_speeds[a] - spectrogram.ref_speeds[b]),
    [spectrogram],
  );
  const [pinned, setPinned] = useState(() => Math.max(0, order.length - 1));
  const presence = usePresence(show);
  const freqFilter = useUIStore((s) => s.freqFilter);

  // The lines of the frequency window the 3D view shows (the same rule).
  const lines = useMemo(() => {
    const [b0, b1] = freqWindow(spectrogram.freq_axis, freqFilter);
    const freq = spectrogram.freq_axis.slice(b0, b1 + 1);
    return { b0, freq, fMin: freq[0] ?? 0, fMax: freq[freq.length - 1] ?? 1 };
  }, [spectrogram, freqFilter]);

  const row: number | undefined = hover ? hover.specRow : order[Math.min(pinned, order.length - 1)];
  // The pointer moving along one row (across the frequencies) keeps the
  // plot; nothing is drawn while the panel is closed.
  const mounted = presence.mounted;
  const plot = useMemo(() => {
    if (!mounted || row == null) return null;
    const { b0, freq, fMin, fMax } = lines;
    const spectrum = spectrogram.z_matrix[row];
    const values = freq.map((_, i) => spectrum?.[b0 + i] ?? 0);
    let vMax = 0;
    for (const v of values) if (v > vMax) vMax = v;
    const yTicks = ticksReaching(Math.max(vMax, 0.1), 3);
    const yTop = yTicks[yTicks.length - 1] || 1;
    const x = (hz: number) => PAD.l + ((hz - fMin) / Math.max(1e-9, fMax - fMin)) * IW;
    const y = (v: number) => PAD.t + IH - (Math.min(v, yTop) / yTop) * IH;
    const path = values
      .map((v, i) => `${i ? 'L' : 'M'}${x(freq[i]).toFixed(1)} ${y(v).toFixed(1)}`)
      .join('');
    return { x, y, yTicks, xTicks: niceTicks(fMin, fMax, 6), path };
  }, [mounted, spectrogram, row, lines]);

  if (!plot || row == null) return null;

  const rpm = spectrogram.ref_speeds[row] ?? 0;
  const { x, y, yTicks, xTicks, path } = plot;
  const title = t('workspace.slice.title', { rpm: fmt.rpm(rpm) });

  return (
    <div
      className={`float pointer-events-auto absolute bottom-3 z-10 mx-auto max-w-[560px] rounded-xl p-3 text-xs transition-[left,right] duration-250 ease-smooth ${
        presence.exiting ? 'animate-exit' : 'animate-enter'
      }`}
      style={{ left: MARGIN_PX + inset.left, right: MARGIN_PX + inset.right }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink-100">{title}</span>
          <span className="text-[11px] text-ink-400">
            {hover ? t('workspace.slice.following') : t('workspace.slice.pick')}
          </span>
        </div>
        <CloseButton label={t('workspace.slice.close')} onClick={toggle} />
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title}>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.l}
              x2={PAD.l + IW}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-edge"
              strokeOpacity={0.07}
            />
            <text
              x={PAD.l - 5}
              y={y(tick) + 3.5}
              textAnchor="end"
              fontSize="10"
              className="fill-ink-300"
            >
              {fmt.number(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={H - 8}
            textAnchor="middle"
            fontSize="10"
            className="fill-ink-300"
          >
            {fmt.number(tick)}
          </text>
        ))}
        <text
          x={PAD.l + IW}
          y={H - 8}
          textAnchor="end"
          fontSize="10"
          className="fill-ink-300"
          dx={-2}
          dy={-12}
        >
          {t('workspace.units.hz')}
        </text>
        {hover && (
          <line
            x1={x(hover.freqHz)}
            x2={x(hover.freqHz)}
            y1={PAD.t}
            y2={PAD.t + IH}
            className="stroke-ink-50"
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
        )}
        <path
          d={path}
          fill="none"
          className="stroke-accent-400"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <text
          x={8}
          y={PAD.t + IH / 2}
          fontSize="10"
          className="fill-ink-300"
          textAnchor="middle"
          transform={`rotate(-90 8 ${PAD.t + IH / 2})`}
        >
          {t('workspace.units.mmS')}
        </text>
      </svg>

      {!hover && (
        <input
          type="range"
          min={0}
          max={order.length - 1}
          value={Math.min(pinned, order.length - 1)}
          onChange={(e) => setPinned(Number(e.target.value))}
          className="mt-1 w-full accent-accent-400"
          aria-label={t('workspace.slice.speed')}
        />
      )}
    </div>
  );
}
