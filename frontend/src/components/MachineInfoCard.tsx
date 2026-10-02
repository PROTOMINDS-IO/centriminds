// Machine section. What drives the analysis: the machine profile (whose
// components the peaks and order lines come from), this measurement's values
// of the profile's parameters (the differential speed of this run, the
// mains frequency) and the bowl diameter (the rating's limit class). A
// change to any of them makes the latest analysis out of date, and the
// workspace runs it again. The rest is record-keeping about the measurement.
// Every field saves on its own: a text field when it is left, a choice as
// soon as it is made.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { MachineProfileRead, ProjectDetail, ProjectUpdate } from '../api/types';
import { useProfiles, useUpdateProject } from '../hooks/queries';
import { useI18n } from '../i18n';
import FormError from './FormError';
import { CommitInput, CommitTextarea } from './ui/CommitInput';
import { FOCUS_RING, Field } from './ui/controls';
import Panel from './ui/Panel';
import { SENSOR_DIRECTIONS } from './waterfall/labels';

interface Props {
  project: ProjectDetail;
}

type MetaKey = 'sensor_location' | 'sensor_direction' | 'operator' | 'site';

/** The bowl diameter field, so other sections can take the user there. */
export const BOWL_DIAMETER_FIELD = 'bowl-d';

export default function MachineInfoCard({ project }: Props) {
  const { t, fmt } = useI18n();
  const update = useUpdateProject();
  const profilesQ = useProfiles();
  const meta = project.measurement_metadata;
  const profiles = profilesQ.data ?? [];
  const generic = profiles.find((p) => p.builtin);
  const profile =
    profiles.find((p) => p.id === project.machine_profile_id) ??
    (project.machine_profile_id == null ? generic : undefined);

  function patch(body: ProjectUpdate) {
    // A failure shows in the section (update.error).
    update.mutate({ id: project.id, body });
  }

  const saveMeta = (key: MetaKey, value: string) =>
    patch({ measurement_metadata: { [key]: value.trim() || null } });

  function saveDiameter(text: string) {
    const value = text.trim();
    // Empty clears it (the strictest limit class then applies); anything but
    // a positive number is not saved, and the field shows it as invalid.
    const next = value === '' ? null : Number(value);
    if (next !== null && (!Number.isFinite(next) || next <= 0)) return;
    patch({ bowl_diameter_mm: next });
  }

  function chooseProfile(id: number) {
    const chosen = profiles.find((p) => p.id === id);
    // Values set for another profile's parameters would not mean the same.
    patch({ machine_profile_id: chosen?.builtin ? null : id, machine_parameters: {} });
  }

  // The file name at the end of the export's #Path header (a full path, split
  // on / and \), else the name the file was uploaded under.
  const file =
    (project.odx_header_path ?? project.odx_filename)?.split(/[\\/]/).filter(Boolean).pop() ??
    project.odx_filename;

  return (
    <div className="space-y-4">
      <FormError error={update.error} />

      <Panel title={t('workspace.machine.machine')}>
        <Field label={t('workspace.machine.profile')} htmlFor="profile">
          <select
            id="profile"
            className="select"
            value={profile?.id ?? ''}
            onChange={(e) => chooseProfile(Number(e.target.value))}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <p className="-mt-1 text-[11px] leading-relaxed text-ink-300">
          {profile && !profile.builtin ? (
            <Link
              to={`/machines/${profile.id}`}
              className={`rounded-sm text-accent-300 hover:text-accent-200 hover:underline ${FOCUS_RING}`}
            >
              {t('workspace.machine.editProfile')}
            </Link>
          ) : (
            <>
              {t('workspace.machine.genericNote')}{' '}
              <Link
                to="/machines"
                className={`rounded-sm text-accent-300 hover:text-accent-200 hover:underline ${FOCUS_RING}`}
              >
                {t('workspace.machine.manageProfiles')}
              </Link>
            </>
          )}
        </p>
        <Field
          label={t('workspace.machine.bowlDiameter')}
          htmlFor={BOWL_DIAMETER_FIELD}
          hint={t('workspace.machine.bowlDiameterHint')}
        >
          <div className="relative">
            <CommitInput
              id={BOWL_DIAMETER_FIELD}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder={
                profile?.data.bowl_diameter_mm
                  ? t('workspace.machine.fromProfile', {
                      value: fmt.number(profile.data.bowl_diameter_mm, 0),
                    })
                  : t('common.notSet')
              }
              className="input pr-10 invalid:border-danger invalid:ring-danger/30"
              value={project.bowl_diameter_mm ? String(project.bowl_diameter_mm) : ''}
              onCommit={saveDiameter}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-300">
              {t('workspace.units.mm')}
            </span>
          </div>
        </Field>
      </Panel>

      {profile && profile.data.parameters.length > 0 && (
        <RunParameters
          profile={profile}
          values={project.machine_parameters}
          onChange={(values) => patch({ machine_parameters: values })}
        />
      )}

      <Panel title={t('workspace.machine.measurement')}>
        <p className="-mt-1 text-[11px] leading-relaxed text-ink-300">
          {t('workspace.machine.limitsNote')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('workspace.machine.sensorPosition')} htmlFor="loc">
            <CommitInput
              id="loc"
              className="input"
              placeholder={t('workspace.machine.sensorPlaceholder')}
              value={meta?.sensor_location ?? ''}
              onCommit={(v) => saveMeta('sensor_location', v)}
            />
          </Field>
          <Field label={t('workspace.machine.direction')} htmlFor="dir">
            <select
              id="dir"
              className="select"
              value={meta?.sensor_direction ?? ''}
              onChange={(e) => saveMeta('sensor_direction', e.target.value)}
            >
              <option value="">–</option>
              {SENSOR_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`workspace.machine.directions.${d}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('workspace.machine.site')} htmlFor="site">
            <CommitInput
              id="site"
              className="input"
              value={meta?.site ?? ''}
              onCommit={(v) => saveMeta('site', v)}
            />
          </Field>
          <Field label={t('workspace.machine.operator')} htmlFor="op">
            <CommitInput
              id="op"
              className="input"
              value={meta?.operator ?? ''}
              onCommit={(v) => saveMeta('operator', v)}
            />
          </Field>
        </div>
        <Field label={t('workspace.machine.notes')} htmlFor="notes">
          <CommitTextarea
            id="notes"
            className="input min-h-[4.5rem] resize-y"
            value={project.notes_markdown ?? ''}
            onCommit={(v) => patch({ notes_markdown: v })}
            placeholder={t('workspace.machine.notesPlaceholder')}
          />
        </Field>
      </Panel>

      <Panel title={t('workspace.machine.file')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <Fact label={t('workspace.machine.fileName')}>{file}</Fact>
          <Fact label={t('workspace.machine.exported')}>{project.odx_export_human ?? '–'}</Fact>
          <Fact label={t('workspace.machine.speed')}>
            {fmt.rpmRange(project.rpm_min, project.rpm_max)}
          </Fact>
          <Fact label={t('workspace.machine.frequency')}>
            {t('workspace.machine.frequencyValue', {
              range: fmt.hzRange(project.freq_min_hz, project.freq_max_hz),
              step: fmt.hz(project.freq_step_hz, 3),
            })}
          </Fact>
          <Fact label={t('workspace.machine.spectra')}>{fmt.number(project.n_blocks, 0)}</Fact>
        </dl>
      </Panel>
    </div>
  );
}

/** This measurement's values of the profile's parameters: the run-specific
 *  ones (differential speed, mains frequency) shown, the rest on request.
 *  An empty field uses the profile's value, shown as its placeholder. */
function RunParameters({
  profile,
  values,
  onChange,
}: {
  profile: MachineProfileRead;
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
}) {
  const { t } = useI18n();
  const params = profile.data.parameters;
  // The overrides as last edited here: each save builds on them rather than
  // on the saved ones, so two fields saved before the project refetches do
  // not undo each other. A change from outside (another profile) replaces
  // them, adjusted while rendering (see useSyncedDraft).
  const savedKey = JSON.stringify(values);
  const [local, setLocal] = useState(values);
  const [synced, setSynced] = useState(savedKey);
  if (savedKey !== synced) {
    setSynced(savedKey);
    setLocal(values);
  }
  const overridden = params.filter((p) => !p.run_specific && local[p.key] != null);
  const [all, setAll] = useState(overridden.length > 0);
  const shown = all ? params : params.filter((p) => p.run_specific);

  function save(key: string, text: string) {
    const v = text.trim() === '' ? null : Number(text);
    if (v !== null && !Number.isFinite(v)) return;
    const next = { ...local };
    if (v === null) delete next[key];
    else next[key] = v;
    setLocal(next);
    onChange(next);
  }

  return (
    <Panel
      title={t('workspace.machine.runParameters')}
      meta={
        Object.keys(local).length > 0
          ? t('workspace.machine.overridden', { count: Object.keys(local).length })
          : undefined
      }
    >
      <p className="-mt-2 text-[11px] leading-relaxed text-ink-300">
        {t('workspace.machine.runParametersHint')}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {shown.map((p) => (
          <Field
            key={p.key}
            label={p.unit ? `${p.label} (${p.unit})` : p.label}
            htmlFor={`param-${p.key}`}
          >
            <CommitInput
              id={`param-${p.key}`}
              type="number"
              inputMode="decimal"
              step="any"
              className="input font-mono tabular-nums"
              placeholder={String(p.value)}
              value={local[p.key] != null ? String(local[p.key]) : ''}
              onCommit={(text) => save(p.key, text)}
            />
          </Field>
        ))}
      </div>
      {params.some((p) => !p.run_specific) && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          aria-expanded={all}
          className={`rounded-sm text-[11px] text-accent-300 hover:text-accent-200 ${FOCUS_RING}`}
        >
          {all ? t('workspace.machine.fewerParameters') : t('workspace.machine.allParameters')}
        </button>
      )}
    </Panel>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-300">{label}</dt>
      <dd className="min-w-0 truncate text-ink-100 tabular-nums">{children}</dd>
    </>
  );
}
