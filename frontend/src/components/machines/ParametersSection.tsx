// The profile's parameters: named values its speed formulas use, some of
// them usually set per measurement (run-specific, e.g. the differential
// speed).
import type { MachineProfileData } from '../../api/types';
import { useI18n } from '../../i18n';
import { type Edit, freeKey, listOps } from './draft';
import { NumberCell, TextCell } from './fields';
import { AddButton, RemoveButton, Section, Table, Td } from './parts';

export default function ParametersSection({
  draft,
  edit,
  keys,
}: {
  draft: MachineProfileData;
  edit: Edit;
  /** Every key in use (parameters and components share one namespace). */
  keys: string[];
}) {
  const { t } = useI18n();
  const ops = listOps(draft, edit, 'parameters');
  return (
    <Section title={t('app.profile.parameters')} hint={t('app.profile.parametersHint')}>
      <Table
        head={[
          t('app.profile.key'),
          t('app.profile.label'),
          t('app.profile.value'),
          t('app.profile.unit'),
          t('app.profile.runSpecific'),
          '',
        ]}
      >
        {draft.parameters.map((p, i) => (
          <tr key={i}>
            <Td className="w-28">
              <TextCell
                value={p.key}
                onChange={(key) => ops.update(i, { key })}
                aria-label={t('app.profile.key')}
                className="font-mono"
              />
            </Td>
            <Td>
              <TextCell
                value={p.label}
                onChange={(label) => ops.update(i, { label })}
                aria-label={t('app.profile.label')}
              />
            </Td>
            <Td className="w-28">
              <NumberCell
                value={p.value}
                onChange={(v) => v != null && ops.update(i, { value: v })}
                aria-label={t('app.profile.value')}
              />
            </Td>
            <Td className="w-20">
              <TextCell
                value={p.unit}
                onChange={(unit) => ops.update(i, { unit })}
                aria-label={t('app.profile.unit')}
              />
            </Td>
            <Td className="w-16 text-center">
              <input
                type="checkbox"
                checked={p.run_specific}
                onChange={(e) => ops.update(i, { run_specific: e.target.checked })}
                aria-label={t('app.profile.runSpecificLabel', { name: p.label || p.key })}
                className="h-4 w-4 accent-accent-500"
              />
            </Td>
            <Td className="w-10">
              <RemoveButton
                label={t('app.profile.remove', { name: p.label || p.key })}
                onClick={() => ops.remove(i)}
              />
            </Td>
          </tr>
        ))}
      </Table>
      <AddButton
        label={t('app.profile.addParameter')}
        onClick={() =>
          ops.add({
            key: freeKey('p', keys),
            label: t('app.profile.newParameter'),
            unit: '',
            value: 0,
            run_specific: false,
          })
        }
      />
    </Section>
  );
}
