// The measurement card, top left of the workspace: which measurement is open
// and how it is doing. A way back to the projects, the project name (click
// to rename) with its machine and ranges, and the analysis sections as tabs:
// Condition, whose tab carries the rating (the at-a-glance status), Sources
// and Machine. A section expands inside the card on wide screens and as a
// bottom sheet on phones; its tab again, the close button or Escape
// collapses it. Nothing is expanded when a project opens.
import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router';

import type { DecanterSeverity, PhysicsResults, ProjectDetail } from '../api/types';
import { usePresence } from '../hooks/usePresence';
import { useI18n } from '../i18n';
import { ZONES, zoneLabel } from '../lib/severity';
import { type AnalysisPanel, useUIStore } from '../store/uiStore';
import ConditionPanel from './ConditionPanel';
import EditableTitle from './EditableTitle';
import FormError from './FormError';
import MachineInfoCard, { BOWL_DIAMETER_FIELD } from './MachineInfoCard';
import SourcesPanel from './SourcesPanel';
import {
  CHROME_BUTTON,
  CHROME_OFF,
  CloseButton,
  Spinner,
  type TabOption,
  TabPanel,
  Tabs,
} from './ui/controls';
import { ChevronLeftIcon } from './ui/icons';
import Reveal from './ui/Reveal';
import { FloatingCard, Sheet } from './workspace/FloatingCard';
import { LEFT_CARD_REM, focusIsIn, useCloseOnEscape, useWide } from './workspace/chrome';

interface Props {
  project: ProjectDetail | undefined;
  physics: PhysicsResults | undefined;
  isAnalyzing: boolean;
  analyzeError: unknown;
  /** Runs the analysis again: the retry after a failure. */
  onReanalyze: () => void;
  onRename: (name: string) => Promise<unknown>;
}

export default function AnalysisDock({
  project,
  physics,
  isAnalyzing,
  analyzeError,
  onReanalyze,
  onRename,
}: Props) {
  const { t, fmt } = useI18n();
  const wide = useWide();
  const open = useUIStore((s) => s.analysisPanel);
  const setOpen = useUIStore((s) => s.setAnalysisPanel);
  const setDisplayOpen = useUIStore((s) => s.setDisplayOpen);
  const idBase = useId();

  function select(panel: AnalysisPanel) {
    if (panel === open) {
      setOpen(null);
      return;
    }
    // Phones show one sheet at a time.
    if (!wide) setDisplayOpen(false);
    setOpen(panel);
  }

  // Collapse, and give focus back to the section's tab if focus was in the
  // card or its sheet (it would otherwise drop to the page).
  const close = useCallback(() => {
    const tab = focusIsIn('left')
      ? document.querySelector<HTMLElement>(
          '[data-chrome="left"] [role="tab"][aria-selected="true"]',
        )
      : null;
    setOpen(null);
    tab?.focus();
  }, [setOpen]);
  useCloseOnEscape(open !== null, close, 'left');

  function editBowlDiameter() {
    select('machine');
    // The Machine section mounts with the next render; focus its field then.
    requestAnimationFrame(() => document.getElementById(BOWL_DIAMETER_FIELD)?.focus());
  }

  const sev = physics?.severity;
  const tabs: TabOption<AnalysisPanel>[] = [
    {
      value: 'condition',
      label: <ConditionTabLabel severity={sev} isAnalyzing={isAnalyzing} />,
      ariaLabel: sev
        ? t('workspace.condition.tabRated', {
            value: fmt.mmS(sev.velocity_mm_s),
            zone: zoneLabel(sev.zone, t),
          })
        : isAnalyzing
          ? t('workspace.condition.tabAnalysing')
          : undefined,
    },
    { value: 'sources', label: t('workspace.sources.tab') },
    { value: 'machine', label: t('workspace.machine.tab') },
  ];
  // The section on show, kept while it slides closed after `open` clears.
  const [section, setSection] = useState(open);
  if (open !== null && open !== section) setSection(open);
  const panel = usePresence(open !== null && wide);
  const sheet = usePresence(open !== null && !wide);
  const sectionTitle = section ? t(`workspace.${section}.tab`) : '';

  const content = section && (
    <div className="space-y-4">
      {Boolean(analyzeError) && (
        <div className="space-y-2">
          <FormError error={analyzeError} />
          <button
            type="button"
            onClick={onReanalyze}
            disabled={isAnalyzing}
            className="btn btn-outline px-2.5 py-1.5 text-xs"
          >
            {t('workspace.condition.reanalyse')}
          </button>
        </div>
      )}
      {section === 'condition' && (
        <ConditionPanel
          physics={physics}
          isAnalyzing={isAnalyzing}
          onEditMachine={editBowlDiameter}
        />
      )}
      {section === 'sources' && <SourcesPanel physics={physics} projectId={project?.id} />}
      {section === 'machine' && (project ? <MachineInfoCard project={project} /> : <Spinner />)}
    </div>
  );

  return (
    <>
      <FloatingCard
        side="left"
        label={t('workspace.chrome.measurement')}
        widthRem={LEFT_CARD_REM}
        expanded={panel.mounted && !panel.exiting}
        className="max-w-[calc(100%-5rem)] sm:max-w-[calc(100%-7.5rem)] md:max-w-[24rem]"
      >
        <div className="shrink-0 space-y-1 p-1.5">
          <div className="flex h-8 items-center gap-1">
            <Link
              to="/"
              aria-label={t('common.backToProjects')}
              title={t('common.backToProjects')}
              className={`${CHROME_BUTTON} w-8 ${CHROME_OFF}`}
            >
              <ChevronLeftIcon />
            </Link>
            <h1 className="flex min-w-0 flex-1">
              {project ? (
                <EditableTitle
                  className="text-sm font-semibold text-ink-50"
                  value={project.name}
                  onCommit={onRename}
                />
              ) : (
                <span className="h-5 w-40 animate-pulse rounded-sm bg-edge/[0.08]" />
              )}
            </h1>
          </div>
          {project && (
            <p className="hidden truncate pr-2 pl-10 text-[11px] text-ink-300 md:block">
              {t('workspace.chrome.subtitle', {
                machine: project.machine_name,
                speed: fmt.rpmRange(project.rpm_min, project.rpm_max),
                frequency: fmt.hzRange(project.freq_min_hz, project.freq_max_hz),
              })}
            </p>
          )}
          <div className="flex items-center gap-1">
            <Tabs
              idBase={idBase}
              label={t('workspace.chrome.sections')}
              value={open}
              onChange={select}
              options={tabs}
              className="min-w-0 flex-wrap"
            />
            {open && wide && (
              <CloseButton
                label={t('workspace.chrome.close', { name: sectionTitle })}
                onClick={close}
              />
            )}
          </div>
        </div>
        {panel.mounted && section && (
          <Reveal open={!panel.exiting} className="min-h-0 w-0 min-w-full flex-1">
            <TabPanel
              idBase={idBase}
              value={section}
              label={sectionTitle}
              className="min-h-0 flex-1 overflow-y-auto border-t border-edge/10 p-3"
            >
              {/* Keyed: switching tabs fades the new section in. */}
              <div key={section} className="animate-enter">
                {content}
              </div>
            </TabPanel>
          </Reveal>
        )}
      </FloatingCard>
      {sheet.mounted && section && (
        <Sheet side="left" title={sectionTitle} onClose={close} exiting={sheet.exiting}>
          <TabPanel idBase={idBase} value={section} label={sectionTitle}>
            {content}
          </TabPanel>
        </Sheet>
      )}
    </>
  );
}

/** The Condition tab: the rating at a glance, or progress before the first one. */
function ConditionTabLabel({
  severity,
  isAnalyzing,
}: {
  severity: DecanterSeverity | undefined;
  isAnalyzing: boolean;
}) {
  const { t, fmt } = useI18n();
  if (severity) {
    return (
      <>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: ZONES[severity.zone].hex }}
          aria-hidden
        />
        <span className="font-mono tabular-nums">
          {fmt.mmSValue(severity.velocity_mm_s)}
          {/* The unit gives way on phones, where the three tabs must fit one row. */}
          <span className="hidden sm:inline">{'\u00a0'}mm/s</span>
        </span>
        <span className="font-normal text-ink-300">{zoneLabel(severity.zone, t)}</span>
      </>
    );
  }
  if (isAnalyzing) {
    return (
      <>
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-400" aria-hidden />
        {t('workspace.condition.analysing')}
      </>
    );
  }
  return t('workspace.condition.tab');
}
