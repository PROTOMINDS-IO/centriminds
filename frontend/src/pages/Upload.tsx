// Upload page (/upload): choose or drop an .odx export, name the project,
// pick its machine profile (by default the one whose match patterns the
// file carries) and send it, with a progress bar. Type and size are checked
// before sending; the project opens once the server has stored it, and its
// analysis starts there.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import BackLink from '../components/BackLink';
import BuiltBy from '../components/brand/BuiltBy';
import FormError from '../components/FormError';
import PageScroll from '../components/PageScroll';
import { UploadIcon } from '../components/ui/icons';
import { OdxChip, RichText } from '../components/ui/RichText';
import { useCreateProject, useProfiles } from '../hooks/queries';
import { usePageTitle } from '../hooks/usePageTitle';
import { useI18n } from '../i18n';

/** The server's cap (backend MAX_UPLOAD_MB, nginx `client_max_body_size`),
 *  checked here so users hear about it before uploading. */
const MAX_MB = 100;
const MAX_BYTES = MAX_MB * 1024 * 1024;

export default function Upload() {
  const { t, fmt } = useI18n();
  usePageTitle(t('app.upload.title'));
  const navigate = useNavigate();
  const create = useCreateProject();
  const profiles = useProfiles();

  const [name, setName] = useState('');
  /** '' = recognise from the file. */
  const [profileId, setProfileId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileProblem, setFileProblem] = useState<'type' | 'size' | null>(null);

  function pick(f: File | null) {
    setFileProblem(null);
    if (!f) return;
    if (!/\.odx$/i.test(f.name)) {
      setFileProblem('type');
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileProblem('size');
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.odx$/i, ''));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    if (name.trim()) form.set('name', name.trim());
    if (profileId) form.set('machine_profile_id', profileId);
    setProgress(0);
    // A failure shows in the form (create.error).
    create.mutate(
      { form, onProgress: setProgress },
      { onSuccess: (created) => navigate(`/projects/${created.id}`) },
    );
  }

  const fileError =
    fileProblem === 'type'
      ? t('app.upload.wrongType')
      : fileProblem === 'size'
        ? t('errors.file_too_large', { max_mb: MAX_MB })
        : null;
  const uploading = create.isPending;
  // Once every byte is sent, the server still reads the file before it answers.
  const status = !uploading
    ? null
    : progress < 1
      ? t('app.upload.progress', { percent: Math.round(progress * 100) })
      : t('app.upload.reading');

  return (
    <PageScroll>
      <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-8">
          <BackLink className="mb-3" />
          <h1 className="text-2xl font-semibold text-ink-50">{t('app.upload.title')}</h1>
          <p className="mt-1 text-sm text-ink-300">
            <RichText text={t('app.upload.intro')} parts={{ odx: <OdxChip /> }} />
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <label
            className={`block cursor-pointer rounded-2xl border-2 border-dashed transition-colors has-focus-visible:ring-2 has-focus-visible:ring-accent-400/50 ${
              dragOver
                ? 'border-accent-400 bg-accent-500/10'
                : file
                  ? 'border-accent-500/40 bg-ink-900/60'
                  : 'border-ink-700 bg-ink-900/40 hover:border-ink-600'
            } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              type="file"
              accept=".odx"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-accent-500/15 text-accent-300 ring-1 ring-accent-400/30">
                <UploadIcon size={22} />
              </div>
              {file ? (
                <div>
                  <div className="text-sm font-medium text-ink-50">{file.name}</div>
                  <div className="text-xs text-ink-300">
                    {t('app.upload.chosen', { size: fmt.number(file.size / 1024 / 1024, 1) })}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-sm font-medium text-ink-100">{t('app.upload.drop')}</div>
                  <div className="mt-1 text-xs text-ink-300">
                    {t('app.upload.limit', { max_mb: MAX_MB })}
                  </div>
                </div>
              )}
            </div>
          </label>

          <div>
            <label className="label" htmlFor="project-name">
              {t('app.upload.name')}
            </label>
            <input
              id="project-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('app.upload.namePlaceholder')}
            />
          </div>

          <div>
            <label className="label" htmlFor="project-machine">
              {t('app.upload.machine')}
            </label>
            <select
              id="project-machine"
              className="select"
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
            >
              <option value="">{t('app.upload.machineAuto')}</option>
              {profiles.data?.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-ink-300">
              {t('app.upload.machineHint')}{' '}
              <Link
                to="/machines"
                className="text-accent-300 hover:text-accent-200 hover:underline"
              >
                {t('app.upload.manageMachines')}
              </Link>
            </p>
          </div>

          <FormError error={fileError ?? create.error} />

          {status && (
            <div className="space-y-1.5" aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                <div
                  className={`h-full rounded-full bg-accent-400 transition-[width] duration-200 ${progress >= 1 ? 'animate-pulse' : ''}`}
                  style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}
                />
              </div>
              <p className="text-xs text-ink-300">{status}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => navigate('/')}
              disabled={uploading}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!file || uploading}>
              {uploading ? t('app.upload.submitting') : t('app.upload.submit')}
            </button>
          </div>
        </form>
        <BuiltBy className="mt-auto justify-center pt-10" />
      </div>
    </PageScroll>
  );
}
