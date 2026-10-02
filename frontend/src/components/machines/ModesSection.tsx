// The profile's structural modes: natural frequencies of the machine (from
// an FE model or a bump test), checked against the sweep by the analysis.
import type { MachineProfileData } from '../../api/types';
import { useI18n } from '../../i18n';
import { type Edit, listOps } from './draft';
import { NumberCell, TextCell } from './fields';
import { AddButton, RemoveButton, Section, Table, Td } from './parts';

export default function ModesSection({ draft, edit }: { draft: MachineProfileData; edit: Edit }) {
  const { t } = useI18n();
  const ops = listOps(draft, edit, 'structural_modes');
  return (
    <Section title={t('app.profile.modes')} hint={t('app.profile.modesHint')}>
      <Table
        head={[t('app.profile.modeName'), t('app.profile.frequency'), t('app.profile.source'), '']}
      >
        {draft.structural_modes.map((m, i) => (
          <tr key={i}>
            <Td>
              <TextCell
                value={m.name}
                onChange={(name) => ops.update(i, { name })}
                aria-label={t('app.profile.modeName')}
              />
            </Td>
            <Td className="w-28">
              <NumberCell
                value={m.freq_hz}
                onChange={(v) => v != null && ops.update(i, { freq_hz: v })}
                aria-label={t('app.profile.frequency')}
              />
            </Td>
            <Td className="w-48">
              <TextCell
                value={m.source}
                onChange={(source) => ops.update(i, { source })}
                aria-label={t('app.profile.source')}
              />
            </Td>
            <Td className="w-10">
              <RemoveButton
                label={t('app.profile.remove', { name: m.name })}
                onClick={() => ops.remove(i)}
              />
            </Td>
          </tr>
        ))}
      </Table>
      <AddButton
        label={t('app.profile.addMode')}
        onClick={() =>
          ops.add({
            name: t('app.profile.newMode'),
            freq_hz: 10,
            source: t('app.profile.newModeSource'),
          })
        }
      />
    </Section>
  );
}
