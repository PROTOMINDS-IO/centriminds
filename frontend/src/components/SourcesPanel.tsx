// Sources: what the vibration comes from. Resonance zones the analysis
// suggests (frequency ranges where several order lines swell), each with
// the lines that support it and a way to keep it as an annotation; the
// zones the machine profile knows; the lines lit whatever the speed (the
// mains, structure, or something unexplained); and the strongest peaks with
// their matched component order.
import type { PhysicsResults, ResonanceZone, StationaryLine } from '../api/types';
import { useAnnotations, useSaveAnnotation } from '../hooks/queries';
import { useI18n } from '../i18n';
import { lineLabel, membersOf, sourceLabel, type Components } from '../lib/sources';
import FormError from './FormError';
import PeakTable from './PeakTable';
import { FOCUS_RING } from './ui/controls';
import { CheckIcon } from './ui/icons';
import Panel from './ui/Panel';
import { zoneShown } from './waterfall/overlays';

export default function SourcesPanel({
  physics,
  projectId,
}: {
  physics: PhysicsResults | undefined;
  projectId: number | undefined;
}) {
  const { t, fmt } = useI18n();
  if (!physics) {
    return (
      <Panel>
        <p className="text-sm text-ink-300">{t('workspace.sources.pending')}</p>
      </Panel>
    );
  }
  const components = physics.machine?.components ?? [];
  const zones = [...(physics.resonance_zones ?? [])].sort(
    (a, b) =>
      Number(zoneShown(b, 'strong')) - Number(zoneShown(a, 'strong')) ||
      b.confidence - a.confidence,
  );
  const matched = physics.peaks.filter((p) => p.source_id).length;
  return (
    <div className="space-y-4">
      <Panel title={t('workspace.sources.zones')}>
        <p className="-mt-2 text-[11px] leading-relaxed text-ink-300">
          {t('workspace.sources.zonesHint')}
        </p>
        {zones.length > 0 ? (
          <ul className="space-y-2">
            {zones.map((z) => (
              <ZoneItem
                key={`${z.lo_hz}-${z.hi_hz}`}
                zone={z}
                components={components}
                projectId={projectId}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-300">{t('workspace.sources.none')}</p>
        )}
      </Panel>

      {(physics.known_zones ?? []).length > 0 && (
        <Panel title={t('workspace.sources.knownZones')}>
          <ul className="divide-y divide-edge/[0.08] text-xs">
            {physics.known_zones!.map((z) => (
              <li key={`${z.lo_hz}-${z.hi_hz}`} className="flex justify-between gap-3 py-1.5">
                <span className="text-ink-100">{z.label}</span>
                <span className="font-mono text-ink-200 tabular-nums">
                  {fmt.number(z.lo_hz, 1)}–{fmt.number(z.hi_hz, 1)}&nbsp;Hz
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={t('workspace.sources.stationary')}>
        <p className="-mt-2 text-[11px] text-ink-300">{t('workspace.sources.stationaryHint')}</p>
        {(physics.stationary_lines ?? []).length > 0 ? (
          <ul className="divide-y divide-edge/[0.08] text-xs">
            {physics.stationary_lines!.map((s) => (
              <StationaryItem key={s.freq_hz} line={s} components={components} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-300">{t('workspace.sources.none')}</p>
        )}
      </Panel>

      <Panel
        title={t('workspace.sources.strongest')}
        meta={t('workspace.sources.matched', { matched, total: physics.peaks.length })}
      >
        <PeakTable peaks={physics.peaks} components={components} />
      </Panel>
    </div>
  );
}

function ZoneItem({
  zone: z,
  components,
  projectId,
}: {
  zone: ResonanceZone;
  components: Components;
  projectId: number | undefined;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const annotations = useAnnotations(projectId);
  const save = useSaveAnnotation(projectId ?? 0);
  const strong = zoneShown(z, 'strong');
  const range = `${fmt.number(z.lo_hz, 1)}–${fmt.number(z.hi_hz, 1)}\u00a0Hz`;
  // Kept already: a band the user saved over the same range.
  const kept = annotations.data?.some(
    (a) =>
      a.annotation_type === 'band' &&
      Math.abs((a.freq_hz ?? -1) - z.lo_hz) < 0.05 &&
      Math.abs((a.freq_hz_end ?? -1) - z.hi_hz) < 0.05,
  );
  const percent = (v: number) => t('workspace.sources.percent', { value: fmt.number(v * 100, 0) });
  return (
    <li
      className={`rounded-md border border-edge/[0.08] p-2 text-xs ${strong ? '' : 'opacity-70'}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-mono font-medium text-ink-50 tabular-nums">{range}</span>
        <span className="text-[11px] text-ink-300">
          {t('workspace.sources.zoneScore', {
            confidence: percent(z.confidence),
            amplitude: fmt.mmS(z.peak_amplitude),
          })}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-300">
        {t('workspace.sources.zoneLines')}{' '}
        {z.evidence
          .map(
            (e) =>
              `${lineLabel({ members: membersOf(e.line_id) }, components, i18n)} (${fmt.rpm(e.rpm)})`,
          )
          .join(', ')}
      </p>
      {z.modes.length > 0 && (
        <p className="mt-1 text-[11px] text-mode">
          {t('workspace.sources.zoneModes', { modes: z.modes.join(', ') })}
        </p>
      )}
      {projectId != null && (
        <div className="mt-1.5">
          {kept ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-accent-300">
              <CheckIcon size={11} strokeWidth={2.5} />
              {t('workspace.sources.kept')}
            </span>
          ) : (
            <button
              type="button"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  body: {
                    annotation_type: 'band',
                    freq_hz: z.lo_hz,
                    freq_hz_end: z.hi_hz,
                    label: t('workspace.sources.keptLabel'),
                    color: 'slot:0',
                  },
                })
              }
              className={`rounded-sm text-[11px] text-accent-300 hover:text-accent-200 hover:underline ${FOCUS_RING}`}
            >
              {t('workspace.sources.keep')}
            </button>
          )}
          <FormError error={save.error} />
        </div>
      )}
    </li>
  );
}

function StationaryItem({ line: s, components }: { line: StationaryLine; components: Components }) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const what =
    s.kind === 'electrical'
      ? t('workspace.sources.kinds.electrical', {
          name: `${sourceLabel(s.source, components, i18n)} ${t('workspace.sources.harmonic', { order: s.order ?? 1 })}`,
        })
      : s.kind === 'structural'
        ? t('workspace.sources.kinds.structural', { name: s.source ?? '' })
        : t('workspace.sources.kinds.unexplained');
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="font-mono text-ink-100 tabular-nums">{fmt.hz(s.freq_hz, 2)}</span>
      <span className="min-w-0 flex-1 truncate text-ink-200">{what}</span>
      <span className="text-right font-mono text-ink-300 tabular-nums">
        {fmt.mmS(s.median_amp)}
      </span>
    </li>
  );
}
