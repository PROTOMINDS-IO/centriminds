// Editor of one machine profile: a draft of its document, edited section by
// section and saved as a whole. While editing, the server checks the draft
// (POST /machines/check) a moment after each change: what does not validate
// is listed, by the formula it concerns where it does; once it validates,
// every formula is evaluated at every operating point and set beside the
// reference speeds a commissioning sheet gave. Built-in profiles are
// read-only; a copy can be edited. The sections are in their own modules.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiError } from '../../api/client';
import type { MachineProfileData, MachineProfileRead } from '../../api/types';
import {
  useCheckProfile,
  useCreateProfile,
  useDeleteProfile,
  useReplaceProfile,
} from '../../hooks/queries';
import { useI18n } from '../../i18n';
import FormError from '../FormError';
import ComponentsSection from './ComponentsSection';
import { NumberCell, TextCell } from './fields';
import ModesSection from './ModesSection';
import ParametersSection from './ParametersSection';
import { Labelled, Section } from './parts';
import PointsSection from './PointsSection';
import { copyOf } from './profileFile';
import ProfileToolbar from './ProfileToolbar';
import ZonesSection from './ZonesSection';

type Problem = { loc: string; msg: string };

/** The problems an `invalid_profile` error on saving lists, paths without "data.". */
function problemsOf(error: unknown): Problem[] {
  if (!(error instanceof ApiError) || error.code !== 'invalid_profile') return [];
  const list = (error.params.errors as Problem[] | undefined) ?? [];
  return list.map((p) => ({ ...p, loc: p.loc.replace(/^data\.?/, '') }));
}

export default function ProfileEditor({ profile }: { profile: MachineProfileRead }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<MachineProfileData>(() => structuredClone(profile.data));
  const replace = useReplaceProfile();
  const create = useCreateProfile();
  const del = useDeleteProfile();
  const check = useCheckProfile();
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(profile.data),
    [draft, profile.data],
  );

  // Check the draft a moment after the last change.
  const runCheck = check.mutate;
  useEffect(() => {
    const timer = window.setTimeout(() => runCheck(draft), 400);
    return () => window.clearTimeout(timer);
  }, [draft, runCheck]);

  // Leaving the page with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const problems = check.data?.problems ?? [];
  const saveProblems = problemsOf(replace.error);
  const edit = (patch: Partial<MachineProfileData>) => setDraft((d) => ({ ...d, ...patch }));
  const keys = [...draft.parameters.map((p) => p.key), ...draft.components.map((c) => c.key)];

  return (
    <div className="space-y-5">
      <ProfileToolbar
        profile={profile}
        draft={draft}
        dirty={dirty}
        saving={replace.isPending}
        onDuplicate={() =>
          create.mutate(copyOf(draft, t('app.machines.copyName', { name: draft.name })), {
            onSuccess: (c) => navigate(`/machines/${c.id}`),
          })
        }
        onDelete={() => del.mutate(profile.id, { onSuccess: () => navigate('/machines') })}
        onRevert={() => {
          replace.reset();
          setDraft(structuredClone(profile.data));
        }}
        onSave={() => replace.mutate({ id: profile.id, data: draft })}
      />

      {saveProblems.length === 0 && (
        <FormError error={replace.error ?? create.error ?? del.error} />
      )}
      <ProblemList problems={saveProblems.length ? saveProblems : problems} />

      <fieldset disabled={profile.builtin} className="min-w-0 space-y-5">
        <Section title={t('app.profile.general')} hint={t('app.profile.generalHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Labelled label={t('app.profile.name')}>
              <TextCell value={draft.name} maxLength={80} onChange={(name) => edit({ name })} />
            </Labelled>
            <Labelled label={t('app.profile.machineType')}>
              <TextCell
                value={draft.machine_type}
                maxLength={80}
                onChange={(machine_type) => edit({ machine_type })}
                placeholder={t('app.profile.machineTypePlaceholder')}
              />
            </Labelled>
            <Labelled
              label={t('app.profile.bowlDiameter')}
              hint={t('app.profile.bowlDiameterHint')}
            >
              <NumberCell
                optional
                value={draft.bowl_diameter_mm}
                onChange={(bowl_diameter_mm) => edit({ bowl_diameter_mm })}
                placeholder={t('common.notSet')}
              />
            </Labelled>
            <Labelled label={t('app.profile.patterns')} hint={t('app.profile.patternsHint')}>
              <PatternsCell
                value={draft.match_patterns}
                onChange={(match_patterns) => edit({ match_patterns })}
              />
            </Labelled>
          </div>
          <Labelled label={t('app.profile.description')}>
            <textarea
              value={draft.description}
              maxLength={2000}
              rows={2}
              onChange={(e) => edit({ description: e.target.value })}
              className="input min-h-[3.5rem] resize-y"
            />
          </Labelled>
        </Section>

        <ParametersSection draft={draft} edit={edit} keys={keys} />
        <ComponentsSection draft={draft} edit={edit} keys={keys} problems={problems} />
        <PointsSection draft={draft} edit={edit} check={check.data} />
        <ModesSection draft={draft} edit={edit} />
        <ZonesSection draft={draft} edit={edit} />
      </fieldset>
    </div>
  );
}

/** Match patterns as one comma-separated field. */
function PatternsCell({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const joined = value.join(', ');
  const [text, setText] = useState(joined);
  const [synced, setSynced] = useState(joined);
  if (joined !== synced) {
    setSynced(joined);
    setText(joined);
  }
  return (
    <TextCell
      value={text}
      onChange={(next) => {
        setText(next);
        const list = next
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        setSynced(list.join(', '));
        onChange(list);
      }}
    />
  );
}

function ProblemList({ problems }: { problems: Problem[] }) {
  const { t } = useI18n();
  if (problems.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text"
    >
      <p className="font-medium">{t('app.profile.problems', { count: problems.length })}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {problems.map((p, i) => (
          <li key={i}>
            {p.loc && <span className="font-mono">{p.loc}: </span>}
            {p.msg}
          </li>
        ))}
      </ul>
    </div>
  );
}
