// The user's annotations on a measurement, saved with the project: lines at
// a frequency or a speed, frequency bands (a resonance zone the engineer
// marks), notes pinned to a point, and order lines (a multiple of the
// measured speed, or of one of the machine's components). Listed with
// their colour; one at a time is added or edited in the form below, whose
// point can be picked on the surface.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type { AnnotationRead, PhysicsResults, UserAnnotationType } from '../../api/types';
import { useAnnotations, useDeleteAnnotation, useSaveAnnotation } from '../../hooks/queries';
import { useI18n } from '../../i18n';
import { sourceLabel } from '../../lib/sources';
import { useResolvedTheme } from '../../lib/theme';
import { useUIStore } from '../../store/uiStore';
import FormError from '../FormError';
import { COMPACT_ACTION, COMPACT_FIELD, FOCUS_RING } from '../ui/controls';
import { CloseIcon, CrosshairIcon, PencilIcon } from '../ui/icons';
import { hzText } from './labels';
import { type Draft, EMPTY_DRAFT, draftOf, toWrite } from './annotationDraft';
import { PALETTES, annotationColour } from './palette';

const TYPES: UserAnnotationType[] = ['band', 'frequency_line', 'speed_line', 'note', 'order_line'];

const FIELD = `w-full min-w-0 ${COMPACT_FIELD}`;

export default function AnnotationsTab({
  projectId,
  physics,
}: {
  projectId: number;
  physics: PhysicsResults | undefined;
}) {
  const i18n = useI18n();
  const { t, fmt } = i18n;
  const theme = useResolvedTheme();
  const list = useAnnotations(projectId);
  const save = useSaveAnnotation(projectId);
  const remove = useDeleteAnnotation(projectId);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const picking = useUIStore((s) => s.picking);
  const setPicking = useUIStore((s) => s.setPicking);
  const components = physics?.machine?.components ?? [];

  // A point picked on the surface fills the form's position.
  useEffect(
    () =>
      useUIStore.subscribe((state, prev) => {
        const point = state.picked;
        if (!point || point === prev.picked) return;
        const f = String(Number(point.freqHz.toFixed(2)));
        const r = String(Math.round(point.rpm));
        setDraft((d) => {
          if (d.type === 'band') {
            return d.freq && !d.freqEnd ? { ...d, freqEnd: f } : { ...d, freq: f };
          }
          return { ...d, freq: f, rpm: r };
        });
        state.setPicked(null);
      }),
    [],
  );
  // Leaving the tab ends a pick in progress.
  useEffect(() => () => setPicking(false), [setPicking]);

  const typeName = (type: UserAnnotationType) => t(`workspace.annotations.types.${type}`);

  function describe(a: AnnotationRead): string {
    const range = (lo: number, hi: number) => `${fmt.number(lo, 1)}–${fmt.number(hi, 1)}\u00a0Hz`;
    const where = (() => {
      switch (a.annotation_type) {
        case 'frequency_line':
          return a.freq_hz != null ? hzText(a.freq_hz, fmt) : '';
        case 'speed_line':
          return a.rpm != null ? fmt.rpm(a.rpm) : '';
        case 'band':
          return a.freq_hz != null && a.freq_hz_end != null ? range(a.freq_hz, a.freq_hz_end) : '';
        case 'note':
          return a.freq_hz != null && a.rpm != null
            ? `${hzText(a.freq_hz, fmt)} · ${fmt.rpm(a.rpm)}`
            : '';
        case 'order_line': {
          const order = t('workspace.sources.harmonic', {
            order: fmt.number(Number(a.payload.order)),
          });
          return a.payload.component
            ? `${sourceLabel(a.payload.component, components, i18n)} ${order}`
            : t('workspace.annotations.ofSpeed', { order });
        }
        default:
          return '';
      }
    })();
    return a.label
      ? `${a.label} · ${where}`
      : `${typeName(a.annotation_type as UserAnnotationType)} · ${where}`;
  }

  function start(target: AnnotationRead | 'new') {
    save.reset();
    setPicking(false);
    if (target === 'new') {
      // A new one takes the next colour.
      setDraft({
        ...EMPTY_DRAFT,
        color: `slot:${(list.data?.length ?? 0) % PALETTES.dark.markers.length}`,
      });
      setEditing('new');
    } else {
      setDraft(draftOf(target));
      setEditing(target.id);
    }
  }

  function close() {
    setPicking(false);
    setEditing(null);
  }

  const body = toWrite(draft);
  function submit() {
    if (!body) return;
    save.mutate(
      { id: editing === 'new' || editing === null ? undefined : editing, body },
      { onSuccess: close },
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const field = (key: keyof Draft, label: string, unit: string) => (
    <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-ink-300">
      <span>
        {label} ({unit})
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={draft[key] as string}
        onChange={(e) => set({ [key]: e.target.value })}
        className={`text-right font-mono tabular-nums ${FIELD}`}
      />
    </label>
  );
  const hz = t('workspace.units.hz');
  const rpm = t('units.rpm');
  const canPick = draft.type !== 'order_line';
  const items = list.data ?? [];

  return (
    <>
      <p className="text-[11px] leading-relaxed text-ink-300">{t('workspace.annotations.intro')}</p>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-2 rounded-md py-0.5 pr-0.5 pl-2 ${
                editing === a.id ? 'bg-accent-500/10 ring-1 ring-accent-400/30' : 'bg-edge/[0.04]'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: annotationColour(a.color, theme) }}
              />
              <span
                className="min-w-0 flex-1 truncate text-ink-100"
                title={a.payload.text || undefined}
              >
                {describe(a)}
              </span>
              <RowButton
                label={t('workspace.annotations.edit', { name: describe(a) })}
                onClick={() => start(a)}
              >
                <PencilIcon size={12} />
              </RowButton>
              <RowButton
                danger
                label={t('workspace.display.remove', { name: describe(a) })}
                onClick={() => {
                  if (editing === a.id) close();
                  remove.mutate(a.id);
                }}
              >
                <CloseIcon size={12} strokeWidth={2.5} />
              </RowButton>
            </li>
          ))}
        </ul>
      ) : (
        !list.isLoading && (
          <p className="text-[11px] text-ink-300">{t('workspace.annotations.none')}</p>
        )
      )}
      <FormError error={list.error ?? remove.error} />

      {editing === null ? (
        <button type="button" onClick={() => start('new')} className={COMPACT_ACTION}>
          {t('workspace.annotations.add')}
        </button>
      ) : (
        <form
          className="space-y-2 rounded-lg border border-edge/10 bg-edge/[0.03] p-2"
          aria-label={
            editing === 'new' ? t('workspace.annotations.add') : t('workspace.annotations.editing')
          }
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-0.5 text-[11px] text-ink-300">
            {t('workspace.annotations.type')}
            <select
              className={`select py-1 ${FIELD}`}
              value={draft.type}
              onChange={(e) => set({ type: e.target.value as UserAnnotationType })}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeName(type)}
                </option>
              ))}
            </select>
          </label>

          {draft.type === 'frequency_line' && (
            <Row>{field('freq', t('workspace.display.frequency'), hz)}</Row>
          )}
          {draft.type === 'speed_line' && (
            <Row>{field('rpm', t('workspace.display.speed'), rpm)}</Row>
          )}
          {draft.type === 'note' && (
            <Row>
              {field('freq', t('workspace.display.frequency'), hz)}
              {field('rpm', t('workspace.display.speed'), rpm)}
            </Row>
          )}
          {draft.type === 'band' && (
            <>
              <Row>
                {field('freq', t('workspace.annotations.from'), hz)}
                {field('freqEnd', t('workspace.annotations.to'), hz)}
              </Row>
              <Row>
                {field('rpm', t('workspace.annotations.fromSpeed'), rpm)}
                {field('rpmEnd', t('workspace.annotations.toSpeed'), rpm)}
              </Row>
              <p className="text-[11px] text-ink-400">{t('workspace.annotations.bandSpeedHint')}</p>
            </>
          )}
          {draft.type === 'order_line' && (
            <Row>
              {field('order', t('workspace.annotations.order'), '×')}
              <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] text-ink-300">
                {t('workspace.annotations.of')}
                <select
                  className={`select py-1 ${FIELD}`}
                  value={draft.component}
                  onChange={(e) => set({ component: e.target.value })}
                >
                  <option value="">{t('workspace.annotations.measuredSpeed')}</option>
                  {components
                    .filter((c) => c.kind !== 'electrical')
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
              </label>
            </Row>
          )}

          {canPick && (
            <button
              type="button"
              onClick={() => setPicking(!picking)}
              aria-pressed={picking}
              className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-accent-300 hover:text-accent-200 ${FOCUS_RING}`}
            >
              <CrosshairIcon size={12} />
              {picking ? t('workspace.annotations.picking') : t('workspace.annotations.pick')}
            </button>
          )}

          <label className="flex flex-col gap-0.5 text-[11px] text-ink-300">
            {t('workspace.display.markerLabel')}
            <input
              value={draft.label}
              maxLength={120}
              onChange={(e) => set({ label: e.target.value })}
              placeholder={t('workspace.annotations.labelPlaceholder')}
              className={FIELD}
            />
          </label>
          {draft.type === 'note' && (
            <label className="flex flex-col gap-0.5 text-[11px] text-ink-300">
              {t('workspace.annotations.text')}
              <textarea
                value={draft.text}
                maxLength={2000}
                rows={3}
                onChange={(e) => set({ text: e.target.value })}
                className={`resize-y ${FIELD}`}
              />
            </label>
          )}

          <div
            role="radiogroup"
            aria-label={t('workspace.annotations.colour')}
            className="flex gap-1.5"
          >
            {PALETTES[theme].markers.map((c, slot) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={draft.color === `slot:${slot}`}
                aria-label={t('workspace.annotations.colourN', { n: slot + 1 })}
                onClick={() => set({ color: `slot:${slot}` })}
                className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-ink-900 ${FOCUS_RING} ${
                  draft.color === `slot:${slot}` ? 'ring-2 ring-ink-100' : ''
                }`}
                style={{ background: c }}
              />
            ))}
          </div>

          <FormError error={save.error} />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={close}
              className={`rounded-md px-2 py-1 text-ink-300 hover:text-ink-50 ${FOCUS_RING}`}
            >
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={!body || save.isPending} className={COMPACT_ACTION}>
              {t('common.save')}
            </button>
          </div>
        </form>
      )}
    </>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-end gap-1.5">{children}</div>;
}

function RowButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-md p-1.5 text-ink-400 ${danger ? 'hover:text-danger-text' : 'hover:text-ink-50'} ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
