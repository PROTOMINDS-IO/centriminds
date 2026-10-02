// The project list (/): each measurement with its spectrum thumbnail,
// machine, rating and age. Search, the condition filter and the sort work in
// the browser on the one list the server sends.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { ProjectSummary, SeverityZone } from '../api/types';
import BuiltBy from '../components/brand/BuiltBy';
import FormError from '../components/FormError';
import PageScroll from '../components/PageScroll';
import SpectrogramThumbnail from '../components/SpectrogramThumbnail';
import { MachineIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/ui/icons';
import { OdxChip, RichText } from '../components/ui/RichText';
import ZoneBadge from '../components/ZoneBadge';
import { useDeleteProject, useProjects } from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';
import { ZONE_ORDER } from '../lib/severity';

type SortKey = 'recent' | 'severity' | 'name';
type ConditionFilter = 'all' | 'attention' | 'unrated';

const SORT_KEYS: SortKey[] = ['recent', 'severity', 'name'];
const CONDITION_FILTERS: ConditionFilter[] = ['all', 'attention', 'unrated'];

/** The line under the project name: the last part of the export's Omnitrend
 *  path (split at \ or /), else the uploaded file's name. */
function sourceFile(p: ProjectSummary) {
  return (
    (p.odx_header_path || p.odx_filename)?.split(/[\\/]/).filter(Boolean).pop() ?? p.odx_filename
  );
}

/** Index in ZONE_ORDER (2 = alarm); -1 when not rated. */
function zoneRank(p: ProjectSummary) {
  return p.severity_zone ? ZONE_ORDER.indexOf(p.severity_zone as SeverityZone) : -1;
}

/** Columns from sm up, shared by the header row and the rows. */
const GRID = 'sm:grid-cols-[168px_minmax(0,1fr)_150px_170px_110px_40px]';

export default function Dashboard() {
  const { t, fmt, locale } = useI18n();
  usePageTitle(t('common.projects'));
  const navigate = useNavigate();
  const { data, isLoading, error } = useProjects();
  const del = useDeleteProject();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [condition, setCondition] = useState<ConditionFilter>('all');

  const projects = useMemo(() => {
    if (!data) return [] as ProjectSummary[];
    const q = search.trim().toLowerCase();
    const out = data.filter((p) => {
      if (condition === 'attention' && zoneRank(p) < 2) return false;
      if (condition === 'unrated' && p.severity_zone) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.odx_filename.toLowerCase().includes(q) ||
        (p.odx_header_path?.toLowerCase().includes(q) ?? false) ||
        p.machine_name.toLowerCase().includes(q)
      );
    });
    return [...out].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, locale);
      if (sortBy === 'severity') return (b.severity_mm_s ?? -1) - (a.severity_mm_s ?? -1);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [data, search, sortBy, condition, locale]);

  const attentionCount = data?.filter((p) => zoneRank(p) >= 2).length ?? 0;

  return (
    <PageScroll>
      <div className="mx-auto flex min-h-full max-w-(--breakpoint-2xl) flex-col px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink-50">{t('common.projects')}</h1>
            <p className="text-sm text-ink-300">
              {data ? (
                <>
                  {t('app.dashboard.count', { count: data.length })}
                  {attentionCount > 0 &&
                    ` · ${t('app.dashboard.attention', { count: attentionCount })}`}
                </>
              ) : (
                t('common.loading')
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/machines" className="btn btn-outline">
              <MachineIcon />
              {t('app.machines.title')}
            </Link>
            <Link to="/upload" className="btn btn-primary">
              <PlusIcon strokeWidth={2.5} />
              {t('app.upload.title')}
            </Link>
          </div>
        </div>

        {data && data.length > 0 && (
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
              <input
                className="input pl-9"
                placeholder={t('app.dashboard.searchPlaceholder')}
                aria-label={t('app.dashboard.searchLabel')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <select
                className="select sm:w-auto"
                aria-label={t('app.dashboard.conditionLabel')}
                value={condition}
                onChange={(e) => setCondition(e.target.value as ConditionFilter)}
              >
                {CONDITION_FILTERS.map((c) => (
                  <option key={c} value={c}>
                    {t(`app.dashboard.condition.${c}`)}
                  </option>
                ))}
              </select>
              <select
                className="select sm:w-auto"
                aria-label={t('app.dashboard.sortLabel')}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
              >
                {SORT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`app.dashboard.sort.${k}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {isLoading && <p className="text-ink-300">{t('common.loading')}</p>}
        {error && (
          <div className="text-sm">
            <FormError error={error} />
          </div>
        )}

        {!isLoading && data && data.length === 0 && (
          <div className="card-glass mx-auto mt-8 max-w-lg space-y-3 text-center">
            <h2 className="text-lg font-semibold text-ink-50">{t('app.dashboard.empty.title')}</h2>
            <p className="text-sm text-ink-300">
              <RichText text={t('app.dashboard.empty.body')} parts={{ odx: <OdxChip /> }} />
            </p>
            <Link to="/upload" className="btn btn-primary inline-flex">
              {t('app.dashboard.empty.action')}
            </Link>
          </div>
        )}

        {projects.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-edge/10 bg-ink-800 shadow-card">
            <div
              className={`hidden items-center gap-4 border-b border-edge/10 bg-ink-900/70 px-4 py-2 text-[11px] tracking-wider text-ink-300 uppercase sm:grid ${GRID}`}
            >
              <span>{t('app.dashboard.columns.spectrum')}</span>
              <span>{t('app.dashboard.columns.project')}</span>
              <span>{t('app.dashboard.columns.machine')}</span>
              <span>{t('app.dashboard.columns.condition')}</span>
              <span>{t('app.dashboard.columns.added')}</span>
              <span />
            </div>

            <ul className="divide-y divide-edge/[0.08]">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className={`group grid cursor-pointer grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-3 transition-colors hover:bg-ink-700/40 sm:gap-4 sm:px-4 ${GRID}`}
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <SpectrogramThumbnail
                    projectId={p.id}
                    width={168}
                    height={48}
                    fluid
                    className="row-span-2 transition-shadow group-hover:shadow-glow-sm group-hover:ring-accent-400/40 sm:row-span-1"
                  />

                  <div className="min-w-0">
                    <Link
                      to={`/projects/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-medium text-ink-50 group-hover:text-accent-200"
                    >
                      {p.name}
                    </Link>
                    <div className="truncate text-xs text-ink-300">{sourceFile(p)}</div>
                  </div>

                  <div className="hidden text-xs sm:block">
                    <div className="truncate text-ink-100">{p.machine_name}</div>
                    <div className="text-ink-300 tabular-nums">
                      {fmt.rpmRange(p.rpm_min, p.rpm_max)}
                    </div>
                  </div>

                  <div className="col-start-2 row-start-2 flex items-center gap-2 text-xs sm:col-start-auto sm:row-start-auto">
                    {p.severity_zone ? (
                      <>
                        <ZoneBadge zone={p.severity_zone as SeverityZone} />
                        {p.severity_mm_s != null && (
                          <span className="font-mono text-ink-200 tabular-nums">
                            {fmt.mmS(p.severity_mm_s)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-400">{t('app.dashboard.notAnalysed')}</span>
                    )}
                  </div>

                  <div className="hidden text-xs text-ink-300 sm:block">
                    <time dateTime={p.created_at} title={fmt.dateTime(p.created_at)}>
                      {fmt.relative(p.created_at)}
                    </time>
                  </div>

                  <div className="row-span-2 flex justify-end sm:row-span-1">
                    <button
                      type="button"
                      className="rounded-md p-2 text-ink-400 opacity-70 transition group-hover:opacity-100 hover:bg-danger/10 hover:text-danger-text focus-visible:opacity-100"
                      aria-label={t('app.dashboard.deleteLabel', { name: p.name })}
                      title={t('app.dashboard.deleteTitle')}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t('app.dashboard.deleteConfirm', { name: p.name }))) {
                          del.mutate(p.id);
                        }
                      }}
                      disabled={del.isPending}
                    >
                      <TrashIcon size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data && data.length > 0 && projects.length === 0 && (
          <p className="mt-6 text-center text-sm text-ink-300">{t('app.dashboard.noMatch')}</p>
        )}

        <BuiltBy className="mt-auto justify-center pt-10" />
      </div>
    </PageScroll>
  );
}
