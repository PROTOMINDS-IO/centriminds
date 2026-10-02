// Overall vibration velocity against bowl speed, over the permissible-level
// zones for the project's bowl-diameter class. One series, one y-axis; zone
// bands are labelled on the right edge so no state relies on colour alone.
// Hover shows a crosshair and the exact reading nearest the cursor. Colours
// come from the theme tokens (the zone bands keep the fixed status colours).
import { useMemo, useRef, useState } from 'react';

import type { DecanterSeverity } from '../api/types';
import { useI18n } from '../i18n';
import { ZONES, zoneLabel } from '../lib/severity';
import { niceTicks } from '../lib/ticks';

// Sized for the ~340 px wide Condition section of the measurement card, so
// 10-unit text renders near 10 px.
const W = 380;
const H = 230;
const PAD = { l: 34, r: 84, t: 10, b: 30 };

export default function SpeedTrendChart({ severity }: { severity: DecanterSeverity }) {
  const { t, fmt } = useI18n();
  const { trend_rpm: rpm, trend_mm_s: v } = severity;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const geom = useMemo(() => {
    const xMin = 0;
    const xMax = Math.max(...rpm, 1);
    const vMax = Math.max(...v, 0);
    // Always show the shutdown level plus headroom so zones read in context.
    const yMax = Math.ceil(Math.max(vMax, severity.shutdown_at) * 1.12);
    const iw = W - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (r: number) => PAD.l + ((r - xMin) / (xMax - xMin)) * iw;
    const y = (mm: number) => PAD.t + ih - (Math.min(mm, yMax) / yMax) * ih;
    const path = rpm
      .map((r, i) => `${i === 0 ? 'M' : 'L'}${x(r).toFixed(1)} ${y(v[i]).toFixed(1)}`)
      .join(' ');
    const xTicks = niceTicks(xMin, xMax, 5);
    const yTicks = niceTicks(0, yMax, 5);
    return { x, y, yMax, iw, ih, path, xTicks, yTicks, xMin, xMax };
  }, [rpm, v, severity.shutdown_at]);

  const bands = [
    { zone: 'good' as const, lo: 0, hi: severity.good_below },
    { zone: 'usable' as const, lo: severity.good_below, hi: severity.alarm_at },
    { zone: 'alarm' as const, lo: severity.alarm_at, hi: severity.shutdown_at },
    { zone: 'shutdown' as const, lo: severity.shutdown_at, hi: geom.yMax },
  ];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || rpm.length === 0) return;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const r = geom.xMin + ((px - PAD.l) / geom.iw) * (geom.xMax - geom.xMin);
    let best = 0;
    for (let i = 1; i < rpm.length; i++) {
      if (Math.abs(rpm[i] - r) < Math.abs(rpm[best] - r)) best = i;
    }
    setHoverIdx(best);
  }

  const h = hoverIdx != null ? { r: rpm[hoverIdx], mm: v[hoverIdx] } : null;
  const hx = h ? geom.x(h.r) : 0;

  return (
    <figure className="space-y-2">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          role="img"
          aria-label={t('workspace.trend.summary', {
            value: fmt.mmS(severity.sweep_max_mm_s),
            rpm: fmt.rpm(severity.sweep_max_rpm),
          })}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHoverIdx(null)}
        >
          {/* Zone bands + right-edge labels */}
          {bands.map((b) => {
            const y0 = geom.y(b.hi);
            const y1 = geom.y(b.lo);
            if (y1 - y0 <= 0) return null;
            return (
              <g key={b.zone}>
                <rect
                  x={PAD.l}
                  y={y0}
                  width={geom.iw}
                  height={y1 - y0}
                  fill={ZONES[b.zone].hex}
                  opacity={0.1}
                />
                <rect
                  x={PAD.l + geom.iw + 6}
                  y={y0 + 2}
                  width={3}
                  height={Math.max(0, y1 - y0 - 4)}
                  rx={1.5}
                  fill={ZONES[b.zone].hex}
                  opacity={0.8}
                />
                {y1 - y0 > 14 && (
                  <text
                    x={PAD.l + geom.iw + 13}
                    y={(y0 + y1) / 2 + 3.5}
                    fontSize="10.5"
                    className="fill-ink-200"
                  >
                    {zoneLabel(b.zone, t)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Grid + axes */}
          {geom.yTicks.map((tick) => (
            <g key={`y${tick}`}>
              <line
                x1={PAD.l}
                x2={PAD.l + geom.iw}
                y1={geom.y(tick)}
                y2={geom.y(tick)}
                className="stroke-edge"
                strokeOpacity={0.07}
              />
              <text
                x={PAD.l - 6}
                y={geom.y(tick) + 3.5}
                textAnchor="end"
                fontSize="10.5"
                className="fill-ink-300"
              >
                {fmt.number(tick)}
              </text>
            </g>
          ))}
          {geom.xTicks.map((tick) => (
            <text
              key={`x${tick}`}
              x={geom.x(tick)}
              y={H - PAD.b + 14}
              textAnchor="middle"
              fontSize="10.5"
              className="fill-ink-300"
            >
              {fmt.number(tick)}
            </text>
          ))}
          <text
            x={PAD.l + geom.iw / 2}
            y={H - 3}
            textAnchor="middle"
            fontSize="10.5"
            className="fill-ink-300"
          >
            {t('workspace.trend.speedAxis')}
          </text>
          <text
            x={11}
            y={PAD.t + geom.ih / 2}
            textAnchor="middle"
            fontSize="10.5"
            className="fill-ink-300"
            transform={`rotate(-90 11 ${PAD.t + geom.ih / 2})`}
          >
            {t('workspace.trend.velocityAxis')}
          </text>

          {/* FAT reference lines (acceptance run, new / refurbished) */}
          {[
            {
              key: 'new',
              label: t('workspace.trend.fatNew', { value: severity.fat_new }),
              at: severity.fat_new,
            },
            {
              key: 'refurbished',
              label: t('workspace.trend.fatRefurbished', { value: severity.fat_refurbished }),
              at: severity.fat_refurbished,
            },
          ].map((f) => (
            <g key={f.key}>
              <line
                x1={PAD.l}
                x2={PAD.l + geom.iw}
                y1={geom.y(f.at)}
                y2={geom.y(f.at)}
                className="stroke-ink-100"
                strokeOpacity={0.35}
                strokeDasharray="3 4"
              />
              <text x={PAD.l + 4} y={geom.y(f.at) - 3} fontSize="9.5" className="fill-ink-300">
                {f.label}
              </text>
            </g>
          ))}

          {/* Series */}
          <path
            d={geom.path}
            fill="none"
            className="stroke-accent-400"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Rated point at operating speed */}
          <circle
            cx={geom.x(severity.operating_rpm)}
            cy={geom.y(severity.velocity_mm_s)}
            r={4.5}
            className="fill-accent-400 stroke-ink-800"
            strokeWidth={2}
          />

          {/* Crosshair */}
          {h && (
            <g pointerEvents="none">
              <line
                x1={hx}
                x2={hx}
                y1={PAD.t}
                y2={PAD.t + geom.ih}
                className="stroke-ink-100"
                strokeOpacity={0.4}
              />
              <circle
                cx={hx}
                cy={geom.y(h.mm)}
                r={4}
                className="fill-accent-400 stroke-ink-800"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {h && (
          <div
            className="pointer-events-none absolute top-1 rounded-md border border-edge/10 bg-ink-900/95 px-2 py-1 text-[11px] shadow-card"
            style={{
              left: `${(hx / W) * 100}%`,
              // Right of the crosshair, or left of it past 60 % of the width,
              // so the readout stays inside the chart.
              transform: hx > W * 0.6 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
            }}
          >
            <div className="font-mono text-ink-50 tabular-nums">{fmt.mmS(h.mm)}</div>
            <div className="font-mono text-ink-300 tabular-nums">{fmt.rpm(h.r)}</div>
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-sm bg-accent-400" aria-hidden />
          {t('workspace.trend.series', {
            band: fmt.hzRange(severity.band_lo_hz, severity.band_hi_hz),
          })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-400" aria-hidden />
          {t('workspace.trend.ratedPoint')}
        </span>
      </figcaption>
    </figure>
  );
}
