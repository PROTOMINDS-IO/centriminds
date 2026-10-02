// The profile's known resonance zones: frequency ranges the waterfall marks
// beside the zones the analysis suggests.
import type { MachineProfileData } from '../../api/types';
import { useI18n } from '../../i18n';
import { type Edit, listOps } from './draft';
import { NumberCell, TextCell } from './fields';
import { AddButton, RemoveButton, Section, Table, Td } from './parts';

export default function ZonesSection({ draft, edit }: { draft: MachineProfileData; edit: Edit }) {
  const { t } = useI18n();
  const ops = listOps(draft, edit, 'resonance_zones');
  return (
    <Section title={t('app.profile.zones')} hint={t('app.profile.zonesHint')}>
      <Table
        head={[
          t('app.profile.label'),
          t('app.profile.from'),
          t('app.profile.to'),
          t('app.profile.source'),
          '',
        ]}
      >
        {draft.resonance_zones.map((z, i) => (
          <tr key={i}>
            <Td>
              <TextCell
                value={z.label}
                onChange={(label) => ops.update(i, { label })}
                aria-label={t('app.profile.label')}
              />
            </Td>
            <Td className="w-24">
              <NumberCell
                value={z.lo_hz}
                onChange={(v) => v != null && ops.update(i, { lo_hz: v })}
                aria-label={t('app.profile.from')}
              />
            </Td>
            <Td className="w-24">
              <NumberCell
                value={z.hi_hz}
                onChange={(v) => v != null && ops.update(i, { hi_hz: v })}
                aria-label={t('app.profile.to')}
              />
            </Td>
            <Td className="w-40">
              <TextCell
                value={z.source}
                onChange={(source) => ops.update(i, { source })}
                aria-label={t('app.profile.source')}
              />
            </Td>
            <Td className="w-10">
              <RemoveButton
                label={t('app.profile.remove', { name: z.label })}
                onClick={() => ops.remove(i)}
              />
            </Td>
          </tr>
        ))}
      </Table>
      <AddButton
        label={t('app.profile.addZone')}
        onClick={() =>
          ops.add({ label: t('app.profile.newZone'), lo_hz: 60, hi_hz: 80, source: '' })
        }
      />
    </Section>
  );
}
