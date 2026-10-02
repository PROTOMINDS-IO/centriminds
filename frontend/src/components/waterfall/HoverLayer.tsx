// What the pointer shows on the 3D waterfall: a marker at the reading, the
// hovered speed's spectrum as a line across the surface, and a tooltip with
// the reading and what it lies on (a matched peak's component order, or an
// order line; see readingSource in overlays.ts).
import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';

import type { PhysicsResults } from '../../api/types';
import { useI18n } from '../../i18n';
import { lineLabel, sourceColour, sourceLabel } from '../../lib/sources';
import { useResolvedTheme } from '../../lib/theme';
import { useUIStore } from '../../store/uiStore';
import { useHoverStore } from './hover';
import type { WaterfallModel } from './model';
import { linesShown, readingSource } from './overlays';
import { useScenePalette } from './palette';

export function HoverLayer({
  model,
  physics,
}: {
  model: WaterfallModel;
  physics?: PhysicsResults;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const theme = useResolvedTheme();
  const palette = useScenePalette();
  const hover = useHoverStore((s) => s.hover);
  const row = hover?.row;

  const rowLine = useMemo(() => {
    if (row == null || !model.rows[row]) return null;
    const z = model.rowZ[row];
    // Lifted just off the surface (and over the line waterfall) so the
    // depth test does not hide it.
    return model.rows[row].map(
      (a, b) => [model.xOfBin(b), model.yOfAmp(a) + 0.006, z] as [number, number, number],
    );
  }, [row, model]);

  // The lines shown change with the options, not with the pointer.
  const maxOrder = useUIStore((s) => s.maxLineOrder);
  const hidden = useUIStore((s) => s.hiddenSourceIds);
  const shown = useMemo(
    () => linesShown(physics?.order_lines ?? [], maxOrder, hidden),
    [physics, maxOrder, hidden],
  );
  const components = physics?.machine?.components ?? [];
  const match = useMemo(() => {
    if (!hover || !physics) return null;
    const source = readingSource(model, physics.peaks, shown, hover);
    if (!source) return null;
    if (source.kind === 'peak') {
      const { peak } = source;
      return {
        colour: peak.source_id,
        text: `${sourceLabel(peak.source_id, physics.machine?.components, i18n)} ${t(
          'workspace.sources.harmonic',
          { order: peak.harmonic },
        )}`,
        confidence: peak.confidence as number | null,
      };
    }
    return {
      colour: source.line.members[0].component,
      text: lineLabel(source.line, physics.machine?.components, i18n),
      confidence: null,
    };
  }, [hover, physics, model, shown, i18n, t]);

  if (!hover || !rowLine) return null;
  const pos: [number, number, number] = [
    model.xOfBin(hover.bin),
    model.yOfAmp(hover.amp),
    model.rowZ[hover.row],
  ];

  // The tooltip is DOM (it renders in its own React root): plain text only,
  // styled by the theme tokens. Above the cards (z-20), below the sheets (z-30).
  return (
    <group>
      <Line points={rowLine} color={palette.hoverLine} lineWidth={1.25} transparent opacity={0.8} />
      <mesh position={pos} renderOrder={10}>
        <sphereGeometry args={[0.016, 16, 16]} />
        <meshBasicMaterial color={palette.hoverPoint} depthTest={false} />
      </mesh>
      <Html position={pos} zIndexRange={[24, 21]} style={{ pointerEvents: 'none' }}>
        <div className="pointer-events-none -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-edge/10 bg-ink-900/95 px-2.5 py-1.5 text-xs whitespace-nowrap shadow-card">
          <div className="font-mono text-ink-50 tabular-nums">{fmt.mmS(hover.amp)}</div>
          <div className="font-mono text-ink-300 tabular-nums">
            {fmt.hz(hover.freqHz, 2)} · {fmt.rpm(hover.rpm)}
          </div>
          {match && (
            <div className="mt-1 flex items-center gap-1.5 text-ink-200">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: sourceColour(match.colour, components, theme) }}
              />
              {match.text}
              {match.confidence != null && (
                <span className="text-ink-400">
                  {t('workspace.sources.percent', {
                    value: fmt.number(match.confidence * 100, 0),
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}
