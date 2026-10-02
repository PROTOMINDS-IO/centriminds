// Display settings of the waterfall, in three tabs: the surface (scale,
// colours, height, speed range), overlays (what the analysis draws) and the
// user's annotations. Nothing here changes the analysis: overlays are view
// state (uiStore), the colour scheme and spread account settings as on the
// Settings page, and annotations are saved with the project.
// Shown inside the view card on wide screens (layout "card": the tab
// content scrolls, and `onClose` puts a close button at the end of the tab
// row) or in its phone sheet.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { PhysicsResults } from '../../api/types';
import { useSyncedDraft } from '../../hooks/useSyncedDraft';
import { useI18n } from '../../i18n';
import { zoneLabel } from '../../lib/severity';
import { sourceColour } from '../../lib/sources';
import { useResolvedTheme } from '../../lib/theme';
import { useSettingsStore } from '../../store/settingsStore';
import { type DisplayTab, useUIStore } from '../../store/uiStore';
import ColormapPicker from '../ColormapPicker';
import { CommitInput } from '../ui/CommitInput';
import {
  COMPACT_ACTION,
  COMPACT_FIELD,
  CloseButton,
  FOCUS_RING,
  Segmented,
  TabPanel,
  Tabs,
  Toggle,
} from '../ui/controls';
import AnnotationsTab from './AnnotationsTab';

interface Props {
  projectId: number;
  /** Frequency range of the whole measurement (the window fields' defaults). */
  freqMin: number;
  freqMax: number;
  /** The analysis: its components are the ones whose lines can be hidden. */
  physics: PhysicsResults | undefined;
  /** Speed range of the whole measurement (the filter fields' defaults). */
  rpmMin: number;
  rpmMax: number;
  layout: 'card' | 'sheet';
  onClose?: () => void;
}

export default function DisplayPanel({
  projectId,
  freqMin,
  freqMax,
  physics,
  rpmMin,
  rpmMax,
  layout,
  onClose,
}: Props) {
  const { t } = useI18n();
  const tab = useUIStore((s) => s.displayTab);
  const setTab = useUIStore((s) => s.setDisplayTab);
  const idBase = useId();
  const card = layout === 'card';
  const tabs: { value: DisplayTab; label: string }[] = [
    { value: 'surface', label: t('workspace.display.surface') },
    { value: 'overlays', label: t('workspace.display.overlays') },
    { value: 'annotations', label: t('workspace.display.annotations') },
  ];

  return (
    <div className={`flex min-h-0 flex-col text-xs ${card ? 'flex-1' : 'gap-3'}`}>
      <div className={`flex shrink-0 items-center gap-1 ${card ? 'px-1.5 pt-1.5' : ''}`}>
        <Tabs
          idBase={idBase}
          label={t('workspace.display.tabs')}
          value={tab}
          onChange={setTab}
          options={tabs}
        />
        {onClose && (
          <CloseButton
            label={t('workspace.chrome.close', { name: t('workspace.view.display') })}
            onClick={onClose}
          />
        )}
      </div>
      <TabPanel
        idBase={idBase}
        value={tab}
        className={`space-y-3 ${card ? 'min-h-0 flex-1 overflow-y-auto p-3' : ''}`}
      >
        {tab === 'surface' && (
          <SurfaceTab rpmMin={rpmMin} rpmMax={rpmMax} freqMin={freqMin} freqMax={freqMax} />
        )}
        {tab === 'overlays' && <OverlaysTab physics={physics} />}
        {tab === 'annotations' && <AnnotationsTab projectId={projectId} physics={physics} />}
      </TabPanel>
    </div>
  );
}

/* ─────────────────────────────  Surface  ──────────────────────────────── */

const SPREAD_KEYS = {
  even: 'spreadEven',
  balanced: 'spreadBalanced',
  detail: 'spreadDetail',
} as const;

function SurfaceTab({
  rpmMin,
  rpmMax,
  freqMin,
  freqMax,
}: {
  rpmMin: number;
  rpmMax: number;
  freqMin: number;
  freqMax: number;
}) {
  const { t, fmt } = useI18n();
  const scale = useUIStore((s) => s.ampScaleMode);
  const setScale = useUIStore((s) => s.setAmpScaleMode);
  const height = useUIStore((s) => s.heightScale);
  const setHeight = useUIStore((s) => s.setHeightScale);
  const rpmFilter = useUIStore((s) => s.rpmFilter);
  const setRpmFilter = useUIStore((s) => s.setRpmFilter);
  const clearRpmFilter = useUIStore((s) => s.clearRpmFilter);
  const freqFilter = useUIStore((s) => s.freqFilter);
  const setFreqFilter = useUIStore((s) => s.setFreqFilter);
  const clearFreqFilter = useUIStore((s) => s.clearFreqFilter);
  // Offered on the linear scale only: on the log scale the colour follows the
  // height (model.ts).
  const spread = useSettingsStore((s) => s.colour_spread);
  const updateSettings = useSettingsStore((s) => s.update);
  const rpmUnit = t('units.rpm');
  const hzUnit = t('workspace.units.hz');

  return (
    <>
      <Row label={t('workspace.display.scale')}>
        <Segmented
          label={t('workspace.display.scale')}
          value={scale}
          options={[
            {
              value: 'linear',
              label: t('workspace.display.linear'),
              title: t('workspace.display.linearTitle'),
            },
            {
              value: 'log',
              label: t('workspace.display.log'),
              title: t('workspace.display.logTitle'),
            },
          ]}
          onChange={setScale}
        />
      </Row>
      <Row label={t('workspace.display.colours')}>
        <ColormapPicker compact label={t('workspace.display.colours')} />
      </Row>
      {scale === 'linear' && (
        <Row label={t('workspace.display.spread')}>
          <Segmented
            label={t('workspace.display.spread')}
            value={spread}
            options={(['even', 'balanced', 'detail'] as const).map((value) => ({
              value,
              label: t(`workspace.display.${SPREAD_KEYS[value]}`),
              title: t(`workspace.display.${SPREAD_KEYS[value]}Title`),
            }))}
            onChange={(value) => updateSettings({ colour_spread: value })}
          />
        </Row>
      )}
      <Row label={t('workspace.display.height')}>
        <input
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
          className={`w-24 rounded-sm accent-accent-400 ${FOCUS_RING}`}
          aria-label={t('workspace.display.heightLabel')}
        />
        <span className="w-9 text-right font-mono text-ink-200 tabular-nums">
          {t('workspace.display.heightValue', { value: fmt.number(height, 1) })}
        </span>
      </Row>
      <RangeFilter
        title={t('workspace.display.speedRange', { unit: rpmUnit })}
        unit={rpmUnit}
        filter={rpmFilter}
        min={rpmMin}
        max={rpmMax}
        onApply={setRpmFilter}
        onClear={clearRpmFilter}
      />
      {/* The frequency window: only the lines between two frequencies are
          drawn, e.g. 0–100 Hz to see a decanter's low orders in detail. */}
      <RangeFilter
        title={t('workspace.display.freqRange', { unit: hzUnit })}
        unit={hzUnit}
        filter={freqFilter}
        min={freqMin}
        max={freqMax}
        onApply={setFreqFilter}
        onClear={clearFreqFilter}
      />
    </>
  );
}

/** Two fields that limit what is drawn to a range of the measurement's
 *  [min, max] (speed or frequency). A range over all of it is no filter. */
function RangeFilter({
  title,
  unit,
  filter,
  min,
  max,
  onApply,
  onClear,
}: {
  title: string;
  /** Of the two fields' accessible names. */
  unit: string;
  filter: { min: number; max: number } | null;
  min: number;
  max: number;
  onApply: (lo: number, hi: number) => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [lo, setLo] = useSyncedDraft(Math.round(filter?.min ?? min));
  const [hi, setHi] = useSyncedDraft(Math.round(filter?.max ?? max));

  function apply() {
    const a = Number(lo);
    const b = Number(hi);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a >= b) return;
    if (a <= min && b >= max) onClear();
    else onApply(a, b);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-ink-300">
        <span>{title}</span>
        {filter && (
          <button
            type="button"
            onClick={onClear}
            className={`rounded-sm text-accent-300 hover:text-accent-200 ${FOCUS_RING}`}
          >
            {t('workspace.display.showAll')}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <NumberInput
          value={lo}
          onChange={setLo}
          onEnter={apply}
          label={t('workspace.display.from', { unit })}
        />
        <span className="text-ink-400">–</span>
        <NumberInput
          value={hi}
          onChange={setHi}
          onEnter={apply}
          label={t('workspace.display.to', { unit })}
        />
        <button type="button" onClick={apply} className={COMPACT_ACTION}>
          {t('common.apply')}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────  Overlays  ─────────────────────────────── */

const LINE_ORDERS = ['1', '2', '3', '5', '10'] as const;

function OverlaysTab({ physics }: { physics: PhysicsResults | undefined }) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  const s = useUIStore(
    useShallow((s) => ({
      showOrderLines: s.showOrderLines,
      toggleOrderLines: s.toggleOrderLines,
      maxLineOrder: s.maxLineOrder,
      setMaxLineOrder: s.setMaxLineOrder,
      showPeaks: s.showPeaks,
      togglePeaks: s.togglePeaks,
      hiddenSourceIds: s.hiddenSourceIds,
      toggleSourceVisibility: s.toggleSourceVisibility,
      showZones: s.showZones,
      toggleZones: s.toggleZones,
      zoneFilter: s.zoneFilter,
      setZoneFilter: s.setZoneFilter,
      showStationary: s.showStationary,
      toggleStationary: s.toggleStationary,
      showStructuralModes: s.showStructuralModes,
      toggleStructuralModes: s.toggleStructuralModes,
      showAnnotations: s.showAnnotations,
      toggleAnnotations: s.toggleAnnotations,
      showSpectrumLines: s.showSpectrumLines,
      toggleSpectrumLines: s.toggleSpectrumLines,
      showThresholds: s.showThresholds,
      toggleThresholds: s.toggleThresholds,
      alarmMmS: s.alarmMmS,
      setAlarmMmS: s.setAlarmMmS,
      shutdownMmS: s.shutdownMmS,
      setShutdownMmS: s.setShutdownMmS,
      showThresholdHighlight: s.showThresholdHighlight,
      toggleThresholdHighlight: s.toggleThresholdHighlight,
    })),
  );
  const components = (physics?.machine?.components ?? []).filter((c) => c.kind !== 'electrical');
  const sourcesShown = s.showOrderLines || s.showPeaks;

  return (
    <>
      <Toggle
        label={t('workspace.display.orderLines')}
        hint={t('workspace.display.orderLinesHint')}
        on={s.showOrderLines}
        onToggle={s.toggleOrderLines}
      />
      {s.showOrderLines && (
        <Row label={t('workspace.display.upToOrder')}>
          <Segmented
            label={t('workspace.display.upToOrder')}
            value={String(s.maxLineOrder) as (typeof LINE_ORDERS)[number]}
            options={LINE_ORDERS.map((o) => ({
              value: o,
              label: t('workspace.sources.harmonic', { order: o }),
            }))}
            onChange={(v) => s.setMaxLineOrder(Number(v))}
          />
        </Row>
      )}
      <Toggle
        label={t('workspace.display.sourcePeaks')}
        on={s.showPeaks}
        onToggle={s.togglePeaks}
      />
      {sourcesShown && components.length > 0 && (
        <div
          role="group"
          aria-label={t('workspace.display.shownSources')}
          className="flex flex-wrap gap-1 pb-1 pl-1"
        >
          {components.map(({ key, label }) => {
            const off = s.hiddenSourceIds.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => s.toggleSourceVisibility(key)}
                aria-pressed={!off}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${FOCUS_RING} ${
                  off ? 'border-edge/[0.06] text-ink-400' : 'border-edge/15 text-ink-100'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${off ? 'bg-ink-500' : ''}`}
                  style={
                    off
                      ? undefined
                      : { background: sourceColour(key, physics?.machine?.components, theme) }
                  }
                />
                {label}
              </button>
            );
          })}
        </div>
      )}
      <Toggle label={t('workspace.display.zones')} on={s.showZones} onToggle={s.toggleZones} />
      {s.showZones && (
        <Row label={t('workspace.display.zonesShown')}>
          <Segmented
            label={t('workspace.display.zonesShown')}
            value={s.zoneFilter}
            options={[
              {
                value: 'strong',
                label: t('workspace.display.zonesStrong'),
                title: t('workspace.display.zonesStrongTitle'),
              },
              { value: 'all', label: t('workspace.display.zonesAll') },
            ]}
            onChange={s.setZoneFilter}
          />
        </Row>
      )}
      <Toggle
        label={t('workspace.display.stationary')}
        on={s.showStationary}
        onToggle={s.toggleStationary}
      />
      <Toggle
        label={t('workspace.display.structuralModes')}
        on={s.showStructuralModes}
        onToggle={s.toggleStructuralModes}
      />
      <Toggle
        label={t('workspace.display.annotationsShown')}
        on={s.showAnnotations}
        onToggle={s.toggleAnnotations}
      />
      <Toggle
        label={t('workspace.display.spectrumLines')}
        on={s.showSpectrumLines}
        onToggle={s.toggleSpectrumLines}
      />
      <Toggle
        label={t('workspace.display.levels')}
        on={s.showThresholds}
        onToggle={s.toggleThresholds}
      />
      {s.showThresholds && (
        <div className="space-y-1.5 pb-1 pl-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <LevelInput label={zoneLabel('alarm', t)} value={s.alarmMmS} onChange={s.setAlarmMmS} />
            <LevelInput
              label={zoneLabel('shutdown', t)}
              value={s.shutdownMmS}
              onChange={s.setShutdownMmS}
            />
            <span className="text-ink-400">{t('workspace.units.mmS')}</span>
          </div>
          <Toggle
            label={t('workspace.display.tint')}
            on={s.showThresholdHighlight}
            onToggle={s.toggleThresholdHighlight}
          />
        </div>
      )}
    </>
  );
}

function LevelInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-ink-300">
      {label}
      <CommitInput
        type="number"
        min={0}
        step={0.5}
        value={String(value)}
        onCommit={(text) => {
          const v = Number(text);
          if (Number.isFinite(v) && v >= 0) onChange(v);
        }}
        className={`w-14 text-right font-mono tabular-nums ${COMPACT_FIELD}`}
      />
    </label>
  );
}

/* ────────────────────────────  Primitives  ────────────────────────────── */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-300">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  onEnter,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  label: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      className={`w-[4.5rem] text-right font-mono tabular-nums ${COMPACT_FIELD}`}
    />
  );
}
