// Condition section: the rating, the speed trend behind it, and the known
// structural modes. Each fact appears once; machine inputs live on the
// Machine section.
import type { ReactNode } from 'react';

import type { DecanterSeverity, PhysicsResults, StructuralModeCheck } from '../api/types';
import { useI18n } from '../i18n';
import { zoneLabel } from '../lib/severity';
import { sourceLabel, type Components } from '../lib/sources';
import SpeedTrendChart from './SpeedTrendChart';
import { Spinner } from './ui/controls';
import Panel from './ui/Panel';
import { RichText } from './ui/RichText';
import { structuralModeName } from './waterfall/labels';
import ZoneBadge from './ZoneBadge';

interface Props {
  physics: PhysicsResults | undefined;
  isAnalyzing: boolean;
  /** Jump to where the bowl diameter is set. */
  onEditMachine: () => void;
}

export default function ConditionPanel({ physics, isAnalyzing, onEditMachine }: Props) {
  const { t, fmt } = useI18n();
  const sev = physics?.severity;

  if (!sev) {
    return (
      <Panel>
        <div className="flex items-center gap-3 text-sm text-ink-300">
          <Spinner />
          {isAnalyzing ? t('workspace.condition.analysingLong') : t('workspace.condition.waiting')}
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <RatingCard sev={sev} onEditMachine={onEditMachine} />

      <Panel
        title={t('workspace.condition.trend')}
        meta={
          <RichText
            text={t('workspace.condition.sweepMax')}
            parts={{
              value: <Num>{fmt.mmS(sev.sweep_max_mm_s)}</Num>,
              rpm: <Num>{fmt.rpm(sev.sweep_max_rpm)}</Num>,
            }}
          />
        }
      >
        <SpeedTrendChart severity={sev} />
      </Panel>

      {physics?.structural_modes?.map((m) => (
        <ModeCard key={m.name} mode={m} components={physics.machine?.components} />
      ))}
    </div>
  );
}

function RatingCard({ sev, onEditMachine }: { sev: DecanterSeverity; onEditMachine: () => void }) {
  const { t, fmt } = useI18n();
  const limits = [
    { label: t('workspace.condition.goodBelow'), value: sev.good_below },
    { label: zoneLabel('alarm', t), value: sev.alarm_at },
    { label: zoneLabel('shutdown', t), value: sev.shutdown_at },
  ];
  return (
    <Panel className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-3xl font-semibold text-ink-50 tabular-nums">
            {fmt.number(sev.velocity_mm_s, 1)}
            <span className="ml-1 text-sm font-normal text-ink-300">
              {t('workspace.condition.unit')}
            </span>
          </span>
          <ZoneBadge zone={sev.zone} />
        </div>
        <p className="mt-1 text-xs text-ink-300">
          <RichText
            text={t('workspace.condition.atOperatingSpeed')}
            parts={{ rpm: <span className="tabular-nums">{fmt.rpm(sev.operating_rpm)}</span> }}
          />
        </p>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-edge/10 rounded-lg bg-edge/[0.04] py-2 text-center">
        {limits.map((l) => (
          <div key={l.label}>
            <dt className="text-[10px] tracking-wider text-ink-300 uppercase">{l.label}</dt>
            <dd className="font-mono text-sm text-ink-100 tabular-nums">{fmt.number(l.value)}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[11px] text-ink-300">
        {t('workspace.condition.limitsFor', { class: sev.diameter_class_label })}
        {sev.bowl_diameter_mm == null && (
          <>
            {'. '}
            {t('workspace.condition.diameterUnset')}{' '}
            <button
              type="button"
              onClick={onEditMachine}
              className="rounded-sm text-accent-300 underline-offset-2 hover:text-accent-200 hover:underline focus-visible:underline focus-visible:outline-hidden"
            >
              {t('workspace.condition.setDiameter')}
            </button>
          </>
        )}
      </p>
    </Panel>
  );
}

/** One structural mode of the machine profile: its frequency and source, the
 *  speed at which the reference component's 1× (the profile's first
 *  mechanical one, usually the bowl) crosses it, if within the sweep, and the
 *  strongest response measured near it anywhere in the sweep (none when the
 *  spectra have no lines near it). */
function ModeCard({
  mode,
  components,
}: {
  mode: StructuralModeCheck;
  components: Components | undefined;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const { response_mm_s: value, response_freq_hz: freq, response_rpm: rpm } = mode;
  return (
    <Panel
      title={structuralModeName(mode.name, i18n)}
      meta={
        <span className="font-mono text-xs text-mode tabular-nums">{fmt.hz(mode.freq_hz, 2)}</span>
      }
    >
      <p className="-mt-1.5 text-xs leading-relaxed text-ink-300">
        {mode.source}
        {mode.crossing_rpm != null && (
          <>
            {'; '}
            <RichText
              text={t('workspace.condition.modeCrossing', {
                component: sourceLabel(mode.crossing_component, components, i18n),
              })}
              parts={{ rpm: <Num>{fmt.rpm(mode.crossing_rpm)}</Num> }}
            />
          </>
        )}
        {'.'}
        {value != null && freq != null && rpm != null && (
          <>
            {' '}
            <RichText
              text={t('workspace.condition.modeResponse')}
              parts={{
                value: <Num>{fmt.mmS(value)}</Num>,
                frequency: <Num>{fmt.hz(freq, 2)}</Num>,
                rpm: <Num>{fmt.rpm(rpm)}</Num>,
              }}
            />
          </>
        )}
      </p>
    </Panel>
  );
}

/** A value inside running text: brighter, with aligned digits. */
function Num({ children }: { children: ReactNode }) {
  return <span className="text-ink-100 tabular-nums">{children}</span>;
}
