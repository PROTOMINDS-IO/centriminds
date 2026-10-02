// The profile's components: what turns (or hums) in the machine, each with
// its speed formula. The server's check of the draft marks a formula it
// cannot use in its row.
import type { ComponentKind, MachineProfileData, ProfileCheck } from '../../api/types';
import { useI18n } from '../../i18n';
import { FOCUS_RING } from '../ui/controls';
import { ChevronDownIcon } from '../ui/icons';
import { type Edit, freeKey, listOps } from './draft';
import { NumberCell, SELECT_CELL, TextCell } from './fields';
import { AddButton, RemoveButton, RowIcon, Section, Table, Td } from './parts';

const KINDS: ComponentKind[] = ['shaft', 'belt', 'gear_mesh', 'electrical', 'other'];

export default function ComponentsSection({
  draft,
  edit,
  keys,
  problems,
}: {
  draft: MachineProfileData;
  edit: Edit;
  /** Every key in use (parameters and components share one namespace). */
  keys: string[];
  /** What keeps the draft from validating (the server's check). */
  problems: ProfileCheck['problems'];
}) {
  const { t } = useI18n();
  const ops = listOps(draft, edit, 'components');
  return (
    <Section title={t('app.profile.components')} hint={t('app.profile.componentsHint')}>
      <Table
        head={[
          t('app.profile.key'),
          t('app.profile.label'),
          t('app.profile.kind'),
          t('app.profile.formula'),
          t('app.profile.maxOrder'),
          '',
        ]}
      >
        {draft.components.map((c, i) => {
          // The server reports every problem of a formula at its place.
          const problem = problems.find((p) => p.loc === `components.${i}.speed_rpm`);
          return (
            <tr key={i}>
              <Td className="w-28">
                <TextCell
                  value={c.key}
                  onChange={(key) => ops.update(i, { key })}
                  aria-label={t('app.profile.key')}
                  className="font-mono"
                />
              </Td>
              <Td className="w-40">
                <TextCell
                  value={c.label}
                  onChange={(label) => ops.update(i, { label })}
                  aria-label={t('app.profile.label')}
                />
              </Td>
              <Td className="w-32">
                <select
                  value={c.kind}
                  onChange={(e) => ops.update(i, { kind: e.target.value as ComponentKind })}
                  aria-label={t('app.profile.kind')}
                  className={SELECT_CELL}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`app.profile.kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </Td>
              <Td className="min-w-56">
                <TextCell
                  value={c.speed_rpm}
                  onChange={(speed_rpm) => ops.update(i, { speed_rpm })}
                  aria-label={t('app.profile.formulaFor', { name: c.label || c.key })}
                  aria-invalid={problem ? true : undefined}
                  spellCheck={false}
                  className="font-mono"
                />
                {problem && <p className="mt-0.5 text-[11px] text-danger-text">{problem.msg}</p>}
              </Td>
              <Td className="w-20">
                <NumberCell
                  value={c.max_order}
                  onChange={(v) => v != null && ops.update(i, { max_order: Math.round(v) })}
                  aria-label={t('app.profile.maxOrder')}
                />
              </Td>
              <Td className="w-24">
                <div className="flex items-center">
                  <RowIcon
                    label={t('app.profile.moveUp')}
                    disabled={i === 0}
                    onClick={() => ops.move(i, -1)}
                  >
                    <ChevronDownIcon size={13} className="rotate-180" />
                  </RowIcon>
                  <RowIcon
                    label={t('app.profile.moveDown')}
                    disabled={i === draft.components.length - 1}
                    onClick={() => ops.move(i, 1)}
                  >
                    <ChevronDownIcon size={13} />
                  </RowIcon>
                  <RemoveButton
                    label={t('app.profile.remove', { name: c.label || c.key })}
                    onClick={() => ops.remove(i)}
                  />
                </div>
              </Td>
            </tr>
          );
        })}
      </Table>
      <AddButton
        label={t('app.profile.addComponent')}
        onClick={() =>
          ops.add({
            key: freeKey('c', keys),
            label: t('app.profile.newComponent'),
            kind: 'shaft',
            speed_rpm: 'n',
            max_order: 10,
          })
        }
      />
      <FormulaHelp />
    </Section>
  );
}

function FormulaHelp() {
  const { t } = useI18n();
  return (
    <details className="rounded-lg border border-edge/[0.08] bg-edge/[0.02] px-3 py-2 text-xs text-ink-300">
      <summary className={`cursor-pointer rounded-sm text-ink-200 ${FOCUS_RING}`}>
        {t('app.profile.formulaHelpTitle')}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
        <li>{t('app.profile.formulaHelpN')}</li>
        <li>{t('app.profile.formulaHelpNames')}</li>
        <li>{t('app.profile.formulaHelpOps')}</li>
        <li>{t('app.profile.formulaHelpOrders')}</li>
        <li>{t('app.profile.formulaHelpKinds')}</li>
      </ul>
    </details>
  );
}
