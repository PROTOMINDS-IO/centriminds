// The profile's operating points, and the check of its formulas at each: the
// computed speed of every component beside the reference speed a
// commissioning sheet gave (editable here), mismatches marked.
import type { MachineProfileData, ProfileCheck } from '../../api/types';
import { useI18n } from '../../i18n';
import { type Edit, listOps } from './draft';
import { NumberCell, TextCell } from './fields';
import { AddButton, RemoveButton, Section } from './parts';

/** A computed speed differs from the sheet's by more than this (rpm). */
const MISMATCH_RPM = 0.5;

export default function PointsSection({
  draft,
  edit,
  check,
}: {
  draft: MachineProfileData;
  edit: Edit;
  check: ProfileCheck | undefined;
}) {
  const { t, fmt } = useI18n();
  const runSpecific = draft.parameters.filter((p) => p.run_specific);
  const points = draft.operating_points;
  const ops = listOps(draft, edit, 'operating_points');

  return (
    <Section title={t('app.profile.points')} hint={t('app.profile.pointsHint')}>
      <div className="space-y-3">
        {points.length > 0 && (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
              <thead>
                <tr className="text-left text-[11px] text-ink-300">
                  <th className="font-medium">{t('app.profile.component')}</th>
                  {points.map((pt, i) => (
                    <th key={i} className="min-w-44 align-top font-medium">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <TextCell
                            value={pt.label}
                            onChange={(label) => ops.update(i, { label })}
                            aria-label={t('app.profile.pointLabel')}
                          />
                          <RemoveButton
                            label={t('app.profile.remove', { name: pt.label })}
                            onClick={() => ops.remove(i)}
                          />
                        </div>
                        <label className="flex items-center gap-1 font-normal">
                          <span className="w-16 shrink-0">{t('app.profile.bowlRpm')}</span>
                          <NumberCell
                            value={pt.bowl_rpm}
                            onChange={(v) => v != null && ops.update(i, { bowl_rpm: v })}
                          />
                        </label>
                        {runSpecific.map((p) => (
                          <label key={p.key} className="flex items-center gap-1 font-normal">
                            <span className="w-16 shrink-0 truncate font-mono" title={p.label}>
                              {p.key}
                            </span>
                            <NumberCell
                              optional
                              value={pt.parameters[p.key]}
                              placeholder={String(p.value)}
                              onChange={(v) => {
                                const next = { ...pt.parameters };
                                if (v == null) delete next[p.key];
                                else next[p.key] = v;
                                ops.update(i, { parameters: next });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.components.map((c) => (
                  <tr key={c.key}>
                    <td className="py-1 pr-2 align-top text-xs">
                      <div className="text-ink-100">{c.label}</div>
                      <div className="font-mono text-[11px] text-ink-400">{c.key}</div>
                    </td>
                    {points.map((pt, i) => {
                      const row = check?.points[i]?.components.find((x) => x.key === c.key);
                      const off = row?.delta_rpm != null && Math.abs(row.delta_rpm) > MISMATCH_RPM;
                      return (
                        <td
                          key={i}
                          className="rounded-md bg-edge/[0.03] px-1.5 py-1 align-top text-xs"
                        >
                          <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                            <span className="text-ink-100">
                              {row?.speed_rpm != null
                                ? fmt.rpm(row.speed_rpm)
                                : row?.error
                                  ? '!'
                                  : '…'}
                            </span>
                            <span className="text-ink-300">
                              {row?.freq_hz != null ? fmt.hz(row.freq_hz, 2) : ''}
                            </span>
                          </div>
                          <label className="mt-1 flex items-center gap-1 text-[11px] text-ink-300">
                            <span className="shrink-0">{t('app.profile.sheet')}</span>
                            <NumberCell
                              optional
                              value={pt.reference_rpm[c.key]}
                              onChange={(v) => {
                                const next = { ...pt.reference_rpm };
                                if (v == null) delete next[c.key];
                                else next[c.key] = v;
                                ops.update(i, { reference_rpm: next });
                              }}
                              aria-label={t('app.profile.sheetFor', {
                                name: c.label,
                                point: pt.label,
                              })}
                              className="py-0.5 text-xs sm:text-xs"
                            />
                          </label>
                          {row?.delta_rpm != null && (
                            <div
                              className={`mt-0.5 text-[11px] tabular-nums ${off ? 'font-medium text-danger-text' : 'text-accent-300'}`}
                            >
                              {off
                                ? t('app.profile.differs', { delta: fmt.number(row.delta_rpm, 1) })
                                : t('app.profile.matches')}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-400">{t('app.profile.pointsNote')}</p>
        <AddButton
          label={t('app.profile.addPoint')}
          onClick={() =>
            ops.add({
              label: t('app.profile.newPoint'),
              bowl_rpm: 3000,
              parameters: {},
              reference_rpm: {},
            })
          }
        />
      </div>
    </Section>
  );
}
