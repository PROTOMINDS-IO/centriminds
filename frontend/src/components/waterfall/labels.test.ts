import { afterEach, describe, expect, it } from 'vitest';

import { getI18n } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { hzText, structuralModeName, tickText } from './labels';

const NBSP = '\u00a0';

afterEach(() => useSettingsStore.setState({ language: 'auto' }));

describe('scene texts', () => {
  it('writes ticks with up to three significant digits in the locale’s notation', () => {
    useSettingsStore.setState({ language: 'en' });
    const { fmt } = getI18n();
    expect([3000, 12.345, 0.1, 0.005].map((v) => tickText(v, fmt))).toEqual([
      '3,000',
      '12.3',
      '0.1',
      '0.005',
    ]);
    expect(hzText(9.1889, fmt)).toBe(`9.19${NBSP}Hz`);

    useSettingsStore.setState({ language: 'de' });
    const de = getI18n().fmt;
    expect([3000, 12.345].map((v) => tickText(v, de))).toEqual(['3.000', '12,3']);
    expect(hzText(50, de)).toBe(`50${NBSP}Hz`);
  });

  it('names the structural modes of the presets in the user’s language', () => {
    useSettingsStore.setState({ language: 'de' });
    const de = getI18n();
    expect(structuralModeName('Rigid-body mode, vertical', de)).toBe('Starrkörpermode, vertikal');
    expect(structuralModeName('Rigid-body mode', de)).toBe('Starrkörpermode');
    expect(structuralModeName('Bending mode 2', de)).toBe('Bending mode 2');

    useSettingsStore.setState({ language: 'en' });
    expect(structuralModeName('Rigid-body mode, vertical', getI18n())).toBe(
      'Rigid-body mode, vertical',
    );
  });
});
