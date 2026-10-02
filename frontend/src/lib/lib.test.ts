import { describe, expect, it } from 'vitest';

import { getI18n } from '../i18n';
import { ZONES, ZONE_ORDER, zoneLabel } from './severity';
import { type Components, lineLabel, membersOf, sourceColour, sourceLabel } from './sources';

describe('severity presentation', () => {
  it('has a label and colour for every zone, in order', () => {
    expect(ZONE_ORDER).toEqual(['good', 'usable', 'alarm', 'shutdown']);
    for (const z of ZONE_ORDER) {
      expect(zoneLabel(z, getI18n().t)).toBeTruthy();
      expect(ZONES[z].hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('formats velocities with sensible precision', () => {
    const { mmS } = getI18n().fmt;
    expect(mmS(7.777)).toBe('7.78\u00a0mm/s');
    expect(mmS(11.46)).toBe('11.5\u00a0mm/s');
    expect(mmS(0.003412)).toBe('0.0034\u00a0mm/s');
    expect(mmS(0)).toBe('0.00\u00a0mm/s');
  });
});

describe('sources', () => {
  const components: Components = [
    { key: 'bowl', label: 'Bowl', kind: 'shaft', max_order: 10 },
    { key: 'mains', label: 'Mains', kind: 'electrical', max_order: 3 },
    { key: 'scroll', label: 'Scroll', kind: 'shaft', max_order: 10 },
  ];

  it('names components as their profile does and tidies unknown ids', () => {
    expect(sourceLabel('scroll', components)).toBe('Scroll');
    expect(sourceLabel('new_source_x', components)).toBe('New source x');
    expect(sourceLabel(null, components)).toBe('Unattributed');
  });

  it('colours mechanical components by their place, electrical ones neutral', () => {
    expect(sourceColour('bowl', components, 'dark')).toBe('#3987e5');
    // The mains takes no slot: the scroll gets the second.
    expect(sourceColour('scroll', components, 'dark')).toBe('#d55181');
    expect(sourceColour('mains', components, 'dark')).toBe('#94a3b8');
    expect(sourceColour('unknown', components, 'light')).toBe('#64748b');
  });

  it('names merged lines once per shared order', () => {
    const merged = { members: membersOf('bowl@1+scroll@1') };
    expect(lineLabel(merged, components)).toBe('Bowl + Scroll 1×');
    expect(lineLabel({ members: membersOf('belt@2+belt_flex@1') }, components)).toBe(
      'Belt 2× + Belt flex 1×',
    );
    const many = { members: membersOf('bowl@3+scroll@3+mains@3+gear@3') };
    expect(lineLabel(many, components)).toBe('Bowl + Scroll + Mains 3× +1');
  });
});
