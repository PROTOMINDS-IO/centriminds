// What the analysis and the user add to the 3D waterfall, each behind its
// toggle in the display panel: order lines laid on the surface, resonance
// zones, speed-independent lines, structural modes, the strongest peak per
// component order, and the user's saved annotations.
import { memo, useMemo } from 'react';
import { Line } from '@react-three/drei';

import type { AnnotationRead, AttributedPeak, PhysicsResults } from '../../api/types';
import { useI18n } from '../../i18n';
import { lineLabel, sourceColour, sourceLabel, type Components } from '../../lib/sources';
import { useResolvedTheme } from '../../lib/theme';
import { useUIStore } from '../../store/uiStore';
import { hzText, structuralModeName } from './labels';
import type { WaterfallModel } from './model';
import {
  ampAt,
  lineFreqAt,
  linesShown,
  staggered,
  surfacePath,
  userOrderFreq,
  zoneShown,
} from './overlays';
import { annotationColour, useScenePalette } from './palette';
import { Band, FrequencyLine, Label, SpeedLine, SurfacePath } from './sceneParts';

interface LayerProps {
  model: WaterfallModel;
  physics?: PhysicsResults;
}

/** A frequency range as "62–78 Hz". */
function rangeText(lo: number, hi: number, fmt: ReturnType<typeof useI18n>['fmt']) {
  return `${fmt.number(lo, 0)}–${fmt.number(hi, 0)}\u00a0Hz`;
}

export const AnalysisLayers = memo(function AnalysisLayers({
  model,
  physics,
  annotations,
}: LayerProps & { annotations: AnnotationRead[] }) {
  return (
    <group>
      <Zones model={model} physics={physics} />
      <StationaryLines model={model} physics={physics} />
      <StructuralModes model={model} physics={physics} />
      <OrderLines model={model} physics={physics} />
      <SourcePeaks model={model} physics={physics} />
      <UserAnnotations model={model} physics={physics} annotations={annotations} />
    </group>
  );
});

/** Order lines of the shown orders, laid on the surface. Every line is
 *  drawn: the shafts' in full, belts and the like thinner and fainter. As on
 *  a hand-marked waterfall only the main lines are named — shaft lines
 *  reaching at least 20 % of the strongest shaft line, at most eight, and
 *  the mains' first order; the pointer names any line. Labels that would
 *  overlap are staggered. */
function OrderLines({ model, physics }: LayerProps) {
  const i18n = useI18n();
  const theme = useResolvedTheme();
  const show = useUIStore((s) => s.showOrderLines);
  const maxOrder = useUIStore((s) => s.maxLineOrder);
  const hidden = useUIStore((s) => s.hiddenSourceIds);
  const components: Components = useMemo(() => physics?.machine?.components ?? [], [physics]);
  const drawn = useMemo(() => {
    if (!show) return [];
    const kindOf = (key: string) => components.find((c) => c.key === key)?.kind;
    const lines = linesShown(physics?.order_lines ?? [], maxOrder, hidden);
    const shaft = (l: (typeof lines)[number]) => kindOf(l.members[0].component) === 'shaft';
    const top = Math.max(0, ...lines.filter(shaft).map((l) => l.peak_amp));
    const named = new Set(
      lines
        .filter((l) => shaft(l) && l.peak_amp >= 0.2 * top)
        .sort((a, b) => b.peak_amp - a.peak_amp)
        .slice(0, 8)
        .map((l) => l.id),
    );
    const drawn = lines.map((line) => {
      const segments = surfacePath(model, (rpm) => lineFreqAt(line, rpm));
      const last = segments.at(-1)?.at(-1);
      const mains = line.kind === 'electrical' && line.members[0].order === 1;
      return {
        line,
        segments,
        end: last?.[0] ?? 0,
        minor: line.kind === 'mechanical' && !shaft(line),
        labelled: last != null && (named.has(line.id) || mains),
      };
    });
    const labelled = drawn.filter((d) => d.labelled);
    const lifts = staggered(
      labelled.map((d) => d.end),
      0.22,
      0.06,
    );
    return drawn.map((d) => ({ ...d, lift: d.labelled ? lifts[labelled.indexOf(d)] : 0 }));
  }, [show, physics, maxOrder, hidden, model, components]);

  return (
    <group>
      {drawn.map(({ line, segments, labelled, lift, minor }) => {
        const lead = line.members.find((m) => !hidden.includes(m.component)) ?? line.members[0];
        return (
          <SurfacePath
            key={line.id}
            segments={segments}
            color={sourceColour(lead.component, components, theme)}
            dashed={line.kind === 'electrical'}
            width={minor ? 1 : 1.6}
            opacity={minor ? 0.5 : 1}
            label={labelled ? lineLabel(line, components, i18n) : undefined}
            labelLift={lift}
          />
        );
      })}
    </group>
  );
}

/** Suggested resonance zones (by the filter) and the profile's known ones. */
function Zones({ model, physics }: LayerProps) {
  const { t, fmt } = useI18n();
  const palette = useScenePalette();
  const show = useUIStore((s) => s.showZones);
  const filter = useUIStore((s) => s.zoneFilter);
  if (!show || !physics) return null;
  const zones = [
    ...(physics.resonance_zones ?? [])
      .filter((z) => zoneShown(z, filter))
      .map((z) => ({
        key: `zone-${z.lo_hz}-${z.hi_hz}`,
        lo: z.lo_hz,
        hi: z.hi_hz,
        known: false,
        label: t('workspace.scene.zone', { range: rangeText(z.lo_hz, z.hi_hz, fmt) }),
      })),
    ...(physics.known_zones ?? []).map((z) => ({
      key: `known-${z.lo_hz}-${z.hi_hz}`,
      lo: z.lo_hz,
      hi: z.hi_hz,
      known: true,
      label: t('workspace.scene.knownZone', {
        label: z.label,
        range: rangeText(z.lo_hz, z.hi_hz, fmt),
      }),
    })),
  ];
  // Labels of neighbouring zones step up instead of overlapping.
  const lifts = staggered(
    zones.map((z) => model.xOfFreq((z.lo + z.hi) / 2)),
    0.5,
    0.07,
  );
  return (
    <group>
      {zones.map((z, i) => (
        <Band
          key={z.key}
          model={model}
          loHz={z.lo}
          hiHz={z.hi}
          color={palette.band}
          opacity={z.known ? 0.1 : 0.2}
          dashed={z.known}
          label={z.label}
          labelLift={lifts[i]}
        />
      ))}
    </group>
  );
}

/** Speed-independent lines: the mains dashed in the neutral colour (unless
 *  the order lines draw it), the unexplained in their own colour. */
function StationaryLines({ model, physics }: LayerProps) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const theme = useResolvedTheme();
  const palette = useScenePalette();
  const show = useUIStore((s) => s.showStationary);
  const linesOn = useUIStore((s) => s.showOrderLines);
  if (!show || !physics) return null;
  const components = physics.machine?.components ?? [];
  return (
    <group>
      {(physics.stationary_lines ?? [])
        // Structural lines are the modes' lines, and the mains is an order
        // line of its own while those show.
        .filter((s) => s.kind !== 'structural' && !(s.kind === 'electrical' && linesOn))
        .map((s) => {
          const frequency = hzText(Number(s.freq_hz.toPrecision(4)), fmt);
          const electrical = s.kind === 'electrical';
          return (
            <FrequencyLine
              key={`st-${s.freq_hz}`}
              model={model}
              freqHz={s.freq_hz}
              dashed={electrical}
              color={electrical ? sourceColour(s.source, components, theme) : palette.stationary}
              label={
                electrical
                  ? t('workspace.scene.electrical', {
                      name: sourceLabel(s.source, components, i18n),
                      frequency,
                    })
                  : t('workspace.scene.stationary', { frequency })
              }
            />
          );
        })}
    </group>
  );
}

function StructuralModes({ model, physics }: LayerProps) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const palette = useScenePalette();
  const show = useUIStore((s) => s.showStructuralModes);
  if (!show || !physics) return null;
  return (
    <group>
      {physics.structural_modes?.map((m) => (
        <FrequencyLine
          key={m.name}
          model={model}
          freqHz={m.freq_hz}
          color={palette.mode}
          label={t('workspace.scene.mode', {
            // The kind of mode only: the frequency tells them apart.
            name: structuralModeName(m.name.split(',')[0], i18n),
            frequency: fmt.hz(m.freq_hz, 2),
          })}
        />
      ))}
    </group>
  );
}

/** The loudest peak of each component order among confident attributions
 *  (≥ 0.5), loudest first and at most 12, so the labels stay readable. */
function strongestPerSource(peaks: AttributedPeak[]): AttributedPeak[] {
  const best = new Map<string, AttributedPeak>();
  for (const p of peaks) {
    if (!p.source_id || p.confidence < 0.5) continue;
    const key = `${p.source_id}#${p.harmonic}`;
    const cur = best.get(key);
    if (!cur || p.amplitude > cur.amplitude) best.set(key, p);
  }
  return [...best.values()].sort((a, b) => b.amplitude - a.amplitude).slice(0, 12);
}

function SourcePeaks({ model, physics }: LayerProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const theme = useResolvedTheme();
  const show = useUIStore((s) => s.showPeaks);
  const hidden = useUIStore((s) => s.hiddenSourceIds);
  const peaks = useMemo(() => strongestPerSource(physics?.peaks ?? []), [physics]);
  if (!show || !physics) return null;
  const components = physics.machine?.components ?? [];
  return (
    <group>
      {peaks
        .filter(
          (p) => !hidden.includes(p.source_id!) && p.rpm >= model.rpmMin && p.rpm <= model.rpmMax,
        )
        .map((p) => {
          const x = model.xOfFreq(p.freq_hz);
          const y = model.yOfAmp(p.amplitude);
          const z = model.zOfRpm(p.rpm);
          const colour = sourceColour(p.source_id, components, theme);
          return (
            <group key={`${p.source_id}-${p.harmonic}`} position={[x, 0, z]}>
              <Line
                points={[
                  [0, 0, 0],
                  [0, y + 0.05, 0],
                ]}
                color={colour}
                lineWidth={1}
                transparent
                opacity={0.7}
              />
              <mesh position={[0, y + 0.05, 0]}>
                <sphereGeometry args={[0.014, 12, 12]} />
                <meshBasicMaterial color={colour} />
              </mesh>
              <Label position={[0, y + 0.1, 0]} anchorY="bottom" color={colour} size={0.05}>
                {`${sourceLabel(p.source_id, components, i18n)} ${t('workspace.sources.harmonic', {
                  order: p.harmonic,
                })}`}
              </Label>
            </group>
          );
        })}
    </group>
  );
}

/** The user's annotations: frequency and speed lines, bands, notes (a pin
 *  on the surface with its text) and order lines. */
function UserAnnotations({
  model,
  physics,
  annotations,
}: LayerProps & { annotations: AnnotationRead[] }) {
  const { t, fmt } = useI18n();
  const theme = useResolvedTheme();
  const show = useUIStore((s) => s.showAnnotations);
  if (!show) return null;
  return (
    <group>
      {annotations.map((a) => {
        const colour = annotationColour(a.color, theme);
        switch (a.annotation_type) {
          case 'frequency_line':
            if (a.freq_hz == null) return null;
            return (
              <FrequencyLine
                key={a.id}
                model={model}
                freqHz={a.freq_hz}
                color={colour}
                label={named(a.label, hzText(Number(a.freq_hz.toPrecision(4)), fmt), t)}
              />
            );
          case 'speed_line':
            if (a.rpm == null) return null;
            return (
              <SpeedLine
                key={a.id}
                model={model}
                rpm={a.rpm}
                color={colour}
                label={named(a.label, fmt.rpm(a.rpm), t)}
              />
            );
          case 'band':
            if (a.freq_hz == null || a.freq_hz_end == null) return null;
            return (
              <Band
                key={a.id}
                model={model}
                loHz={a.freq_hz}
                hiHz={a.freq_hz_end}
                rpmLo={a.rpm}
                rpmHi={a.rpm_end}
                color={colour}
                label={named(a.label, rangeText(a.freq_hz, a.freq_hz_end, fmt), t)}
              />
            );
          case 'note':
            return <NotePin key={a.id} model={model} annotation={a} color={colour} />;
          case 'order_line': {
            const segments = surfacePath(model, (rpm) => userOrderFreq(a, physics, rpm));
            const order = t('workspace.sources.harmonic', {
              order: fmt.number(Number(a.payload.order)),
            });
            return (
              <SurfacePath
                key={a.id}
                segments={segments}
                color={colour}
                width={2}
                label={named(a.label, order, t)}
              />
            );
          }
          default:
            return null;
        }
      })}
    </group>
  );
}

function named(label: string, value: string, t: ReturnType<typeof useI18n>['t']) {
  return label ? t('workspace.scene.marker', { label, value }) : value;
}

/** A note: a pin standing on the surface at its point, its label above. */
function NotePin({
  model,
  annotation: a,
  color,
}: {
  model: WaterfallModel;
  annotation: AnnotationRead;
  color: string;
}) {
  if (a.freq_hz == null || a.rpm == null) return null;
  if (a.rpm < model.rpmMin || a.rpm > model.rpmMax) return null;
  const x = model.xOfFreq(a.freq_hz);
  if (x < -1 || x > 1) return null;
  const z = model.zOfRpm(a.rpm);
  const row = Math.round(model.rowAtZ(z));
  const y = model.yOfAmp(ampAt(model, row, a.freq_hz));
  const top = y + 0.22;
  const text = a.label || a.payload.text?.split('\n')[0] || '';
  return (
    <group>
      <Line
        points={[
          [x, y, z],
          [x, top, z],
        ]}
        color={color}
        lineWidth={1.4}
      />
      <mesh position={[x, y, z]}>
        <sphereGeometry args={[0.014, 12, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {text && (
        <Label position={[x, top + 0.02, z]} anchorY="bottom" color={color} size={0.05}>
          {text.length > 48 ? `${text.slice(0, 47)}…` : text}
        </Label>
      )}
    </group>
  );
}
