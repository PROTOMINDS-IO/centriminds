// A project's workspace: the 3D waterfall fills the page, and two floating
// cards over it carry the chrome — the measurement on the left (back to the
// projects, name, condition, sources, machine) and the view on the right
// (3D or top, spectrum at one speed, auto-rotate, reset, display settings).
// Whatever the cards expand, the surface stays centred in the room left.
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';

import { ApiError } from '../api/client';
import AnalysisDock from '../components/AnalysisDock';
import { Loading } from '../components/ui/controls';
import ColourLegend from '../components/waterfall/ColourLegend';
import SlicePanel from '../components/waterfall/SlicePanel';
import Waterfall3D from '../components/waterfall/Waterfall3D';
import type { Insets } from '../components/waterfall/framing';
import { useHoverStore } from '../components/waterfall/hover';
import ViewCard from '../components/workspace/ViewCard';
import { useViewInsets } from '../components/workspace/chrome';
import {
  useAnalyzeProject,
  useAnnotations,
  useLatestPhysics,
  useProject,
  useSpectrogramPreview,
  useUpdateProject,
} from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';
import { errorMessage } from '../lib/errorMessage';
import { useUIStore } from '../store/uiStore';

export default function Workspace() {
  const i18n = useI18n();
  const { t } = i18n;
  const { id } = useParams();
  const projectId = Number(id);
  const projectQ = useProject(projectId);
  const specQ = useSpectrogramPreview(projectId);
  const physicsQ = useLatestPhysics(projectId);
  const analyzeM = useAnalyzeProject(projectId);
  const updateM = useUpdateProject();
  const annotationsQ = useAnnotations(projectId);
  const inset = useViewInsets();

  usePageTitle(projectQ.data?.name);

  // View state (speed filter, markers, hidden sources, expanded cards)
  // belongs to one project; each opens with the user's view defaults.
  const resetForProject = useUIStore((s) => s.resetForProject);
  useEffect(() => {
    resetForProject();
    useHoverStore.getState().setHover(null);
  }, [projectId, resetForProject]);

  const run = physicsQ.data;
  const physics = run?.results;
  const severity = physics?.severity;

  // Seed the 3D alarm/shutdown planes from the rating; still adjustable.
  const setThresholds = useUIStore((s) => s.setThresholds);
  useEffect(() => {
    if (severity) setThresholds(severity.alarm_at, severity.shutdown_at);
  }, [severity, setThresholds]);

  // Analysis is deterministic and quick, so it runs by itself whenever the
  // latest run is not of the project's current inputs: a new upload, a run
  // from an older version, or a change to the machine profile, its
  // parameters or the bowl diameter. Once per set of inputs, so a failing
  // analysis is not retried in a loop (the dock offers to retry).
  const inputs = projectQ.data?.analysis_inputs_hash;
  const current = run?.params?.inputs_hash === inputs;
  const autoRan = useRef<string | null>(null);
  useEffect(() => {
    if (!physicsQ.isSuccess || !inputs || current || analyzeM.isPending) return;
    const key = `${projectId}:${inputs}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    analyzeM.mutate({});
  }, [physicsQ.isSuccess, inputs, current, analyzeM, projectId]);

  if (
    Number.isNaN(projectId) ||
    (projectQ.error instanceof ApiError && projectQ.error.status === 404)
  ) {
    return <NotFound />;
  }

  const project = projectQ.data;

  // The cards come first in the page, so keyboard focus meets them before
  // the slice panel at the bottom; stacking is set by their z-index.
  return (
    <div data-workspace className="relative h-full overflow-hidden">
      <AnalysisDock
        project={project}
        physics={physics}
        isAnalyzing={analyzeM.isPending || physicsQ.isLoading}
        analyzeError={analyzeM.error}
        onReanalyze={() => analyzeM.mutate({})}
        onRename={(name) => updateM.mutateAsync({ id: projectId, body: { name } })}
      />
      <ViewCard
        projectId={projectId}
        physics={physics}
        rpmMin={project?.rpm_min ?? 0}
        rpmMax={project?.rpm_max ?? 0}
        freqMin={project?.freq_min_hz ?? 0}
        freqMax={project?.freq_max_hz ?? 0}
      />
      {specQ.isLoading && <Loading>{t('workspace.chrome.loading')}</Loading>}
      {specQ.error && (
        <div className="grid h-full place-items-center p-6 text-center text-sm text-danger-text">
          <p>
            {t('workspace.chrome.loadFailed')} {errorMessage(specQ.error, i18n)}
          </p>
        </div>
      )}
      {specQ.data && (
        <>
          <Waterfall3D
            spectrogram={specQ.data}
            physics={physics}
            annotations={annotationsQ.data}
            inset={inset}
            imageName={project?.name}
          />
          <SlicePanel spectrogram={specQ.data} inset={inset} />
          <ColourLegend inset={inset} />
          <ViewHint inset={inset} />
        </>
      )}
    </div>
  );
}

/** Controls reminder in the bottom-left corner of the free view; gives way
 *  to the slice panel, and stays off phones (touch has its own habits). */
function ViewHint({ inset }: { inset: Insets }) {
  const { t } = useI18n();
  const top = useUIStore((s) => s.viewMode) === 'top';
  const slice = useUIStore((s) => s.showSlice);
  if (slice) return null;
  return (
    <p
      className="pointer-events-none absolute bottom-2 hidden truncate text-[11px] text-ink-400 transition-[left,right] duration-250 ease-smooth md:block"
      style={{ left: 12 + inset.left, right: 12 + inset.right }}
    >
      {top ? t('workspace.hints.top') : t('workspace.hints.orbit')}
    </p>
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="card-glass max-w-sm space-y-3 text-center">
        <h1 className="text-lg font-semibold text-ink-50">{t('workspace.chrome.notFoundTitle')}</h1>
        <p className="text-sm text-ink-300">{t('workspace.chrome.notFoundText')}</p>
        <Link to="/" className="btn btn-primary inline-flex">
          {t('common.backToProjects')}
        </Link>
      </div>
    </div>
  );
}
