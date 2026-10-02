// Machine profiles (/machines): what the analysis knows about each machine —
// its drive train as parameters and speed formulas, its operating points,
// structural modes and known resonance zones. Profiles are data, kept with
// the account: imported from a commissioning sheet (.xlsx, one profile per
// machine sheet) or a profile file (.json), started from a template, copied
// or exported. Uploads pick the profile whose match patterns their file
// carries; a new profile also takes over the projects it recognises.
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import type { MachineProfileRead, ProfileImportResponse } from '../api/types';
import BackLink from '../components/BackLink';
import BuiltBy from '../components/brand/BuiltBy';
import FormError from '../components/FormError';
import { copyOf, downloadProfile } from '../components/machines/profileFile';
import PageScroll from '../components/PageScroll';
import { FOCUS_RING } from '../components/ui/controls';
import { CopyIcon, DownloadIcon, PlusIcon, TrashIcon, UploadIcon } from '../components/ui/icons';
import {
  useCreateProfile,
  useDeleteProfile,
  useImportProfiles,
  useProfiles,
  useProfileTemplates,
} from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';

export default function Machines() {
  const { t } = useI18n();
  usePageTitle(t('app.machines.title'));
  const navigate = useNavigate();
  const profiles = useProfiles();
  const templates = useProfileTemplates();
  const importM = useImportProfiles();
  const create = useCreateProfile();
  const del = useDeleteProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ProfileImportResponse | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  function importFile(file: File | undefined) {
    if (!file) return;
    setResult(null);
    importM.mutate(file, { onSuccess: setResult });
  }

  function duplicate(p: MachineProfileRead) {
    create.mutate(copyOf(p.data, t('app.machines.copyName', { name: p.name })), {
      onSuccess: (created) => navigate(`/machines/${created.id}`),
    });
  }

  return (
    <PageScroll>
      <div className="mx-auto flex min-h-full max-w-4xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6">
          <BackLink className="mb-3" />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <h1 className="text-2xl font-semibold text-ink-50">{t('app.machines.title')}</h1>
              <p className="mt-1 text-sm text-ink-300">{t('app.machines.intro')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  importFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-outline"
                disabled={importM.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <UploadIcon />
                {importM.isPending ? t('app.machines.importing') : t('app.machines.import')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                aria-expanded={newOpen}
                onClick={() => setNewOpen((v) => !v)}
              >
                <PlusIcon strokeWidth={2.5} />
                {t('app.machines.new')}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-400">{t('app.machines.importHint')}</p>
        </div>

        {newOpen && (
          <section
            aria-label={t('app.machines.new')}
            className="mb-5 rounded-xl border border-edge/10 bg-ink-800 p-4 shadow-card"
          >
            <h2 className="text-sm font-semibold text-ink-100">{t('app.machines.fromTemplate')}</h2>
            <p className="mt-0.5 text-xs text-ink-300">{t('app.machines.fromTemplateHint')}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {templates.data?.map((tpl) => (
                <li key={tpl.id}>
                  <button
                    type="button"
                    disabled={create.isPending}
                    onClick={() =>
                      create.mutate(tpl.data, {
                        onSuccess: (created) => navigate(`/machines/${created.id}`),
                      })
                    }
                    className={`h-full w-full rounded-lg border border-edge/10 bg-edge/[0.03] p-3 text-left transition-colors hover:border-accent-400/40 hover:bg-accent-500/10 ${FOCUS_RING}`}
                  >
                    <div className="text-sm font-medium text-ink-50">{tpl.data.name}</div>
                    <div className="mt-1 text-xs leading-relaxed text-ink-300">
                      {tpl.data.description}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <FormError error={templates.error ?? create.error} />
          </section>
        )}

        <FormError error={importM.error} />
        {result && <ImportResult result={result} onClose={() => setResult(null)} />}

        {profiles.isLoading && <p className="text-ink-300">{t('common.loading')}</p>}
        <FormError error={profiles.error ?? del.error ?? (newOpen ? null : create.error)} />

        {profiles.data && (
          <ul className="space-y-3">
            {profiles.data.map((p) => (
              <li
                key={p.id}
                className="rounded-xl border border-edge/10 bg-ink-800 p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/machines/${p.id}`}
                        className={`truncate font-medium text-ink-50 hover:text-accent-200 ${FOCUS_RING} rounded-sm`}
                      >
                        {p.name}
                      </Link>
                      {p.builtin && (
                        <span className="rounded-full bg-edge/[0.08] px-2 py-0.5 text-[10px] tracking-wider text-ink-300 uppercase">
                          {t('app.machines.builtin')}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-300">
                      {[
                        p.data.machine_type,
                        t('app.machines.components', { count: p.data.components.length }),
                        t('app.machines.projects', { count: p.project_count }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {p.data.match_patterns.length > 0 && (
                      <p className="mt-1 text-xs text-ink-400">
                        {t('app.machines.recognises', {
                          patterns: p.data.match_patterns.map((m) => `“${m}”`).join(', '),
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <RowAction
                      label={t('app.machines.duplicate', { name: p.name })}
                      onClick={() => duplicate(p)}
                      disabled={create.isPending}
                    >
                      <CopyIcon size={15} />
                    </RowAction>
                    <RowAction
                      label={t('app.machines.export', { name: p.name })}
                      onClick={() => downloadProfile(p.data)}
                    >
                      <DownloadIcon size={15} />
                    </RowAction>
                    {!p.builtin && (
                      <RowAction
                        danger
                        label={t('app.machines.delete', { name: p.name })}
                        disabled={del.isPending}
                        onClick={() => {
                          const message =
                            p.project_count > 0
                              ? t('app.machines.deleteConfirmUsed', {
                                  name: p.name,
                                  count: p.project_count,
                                })
                              : t('app.machines.deleteConfirm', { name: p.name });
                          if (confirm(message)) del.mutate(p.id);
                        }}
                      >
                        <TrashIcon size={15} />
                      </RowAction>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <BuiltBy className="mt-auto justify-center pt-10" />
      </div>
    </PageScroll>
  );
}

function ImportResult({ result, onClose }: { result: ProfileImportResponse; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <section
      role="status"
      className="mb-5 space-y-2 rounded-xl border border-accent-400/30 bg-accent-500/10 p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-ink-50">
          {t('app.machines.imported', { count: result.imported.length })}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-md px-1.5 text-xs text-ink-300 hover:text-ink-50 ${FOCUS_RING}`}
        >
          {t('common.close')}
        </button>
      </div>
      <ul className="space-y-1.5">
        {result.imported.map(({ profile, source, warnings }) => (
          <li key={profile.id} className="text-xs">
            <Link
              to={`/machines/${profile.id}`}
              className={`font-medium text-accent-200 hover:underline ${FOCUS_RING} rounded-sm`}
            >
              {profile.name}
            </Link>
            <span className="text-ink-300">
              {' · '}
              {t('app.machines.importedFrom', { source })}
              {profile.assigned_projects > 0 &&
                ` · ${t('app.machines.assigned', { count: profile.assigned_projects })}`}
            </span>
            {warnings.length > 0 && (
              <ul className="mt-0.5 list-disc pl-5 text-ink-300">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-300">{t('app.machines.importedCheck')}</p>
    </section>
  );
}

function RowAction({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md p-2 text-ink-400 transition hover:bg-edge/[0.06] ${
        danger ? 'hover:bg-danger/10 hover:text-danger-text' : 'hover:text-ink-50'
      } ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
