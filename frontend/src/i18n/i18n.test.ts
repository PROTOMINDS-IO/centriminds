import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { errorMessage } from '../lib/errorMessage';
import { useSettingsStore } from '../store/settingsStore';
import { de } from './de';
import { en } from './en';
import { getI18n, resolveLocale } from './index';

const NBSP = ' ';

/** Every leaf path of a message tree, e.g. 'workspace.trend.summary'. */
function leaves(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  const obj = node as Record<string, unknown>;
  if ('other' in obj && typeof obj.other === 'string') return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

afterEach(() => {
  useSettingsStore.setState({ language: 'auto' });
  vi.restoreAllMocks();
});

describe('dictionaries', () => {
  it('German has every English message and nothing else', () => {
    expect(leaves(de).sort()).toEqual(leaves(en).sort());
  });

  it('keeps the same placeholders in both languages', () => {
    const get = (tree: unknown, path: string) =>
      path.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], tree);
    const names = (v: unknown) => {
      const texts = typeof v === 'string' ? [v] : Object.values(v as Record<string, string>);
      const found = texts.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
      return [...new Set(found)].sort();
    };
    for (const path of leaves(en)) expect(names(get(de, path)), path).toEqual(names(get(en, path)));
  });
});

describe('translation and formatting', () => {
  it('translates and formats for the chosen language', () => {
    useSettingsStore.setState({ language: 'en' });
    const en = getI18n();
    expect(en.t('common.save')).toBe('Save');
    expect(en.fmt.mmS(11.46)).toBe(`11.5${NBSP}mm/s`);
    expect(en.fmt.rpmRange(120, 3200)).toBe(`120–3,200${NBSP}rpm`);

    useSettingsStore.setState({ language: 'de' });
    const de = getI18n();
    expect(de.t('common.save')).toBe('Speichern');
    expect(de.fmt.mmS(11.46)).toBe(`11,5${NBSP}mm/s`);
    expect(de.fmt.mmS(0.003412)).toBe(`0,0034${NBSP}mm/s`);
    expect(de.fmt.rpmRange(120, 3200)).toBe(`120–3.200${NBSP}U/min`);
    expect(de.t('errors.file_too_large', { max_mb: 100 })).toBe('Die Datei ist größer als 100 MB.');
  });

  it('follows the browser language when set to auto', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'en']);
    expect(resolveLocale('auto')).toBe('de');
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
    expect(resolveLocale('auto')).toBe('en');
    expect(resolveLocale('de')).toBe('de');
  });

  it('turns API error codes into messages, else shows the server text', () => {
    useSettingsStore.setState({ language: 'de' });
    const i18n = getI18n();
    const notRatable = new ApiError(422, '422: …', {
      code: 'not_ratable',
      params: { band_lo_hz: 10, band_hi_hz: 1000 },
      detail: 'The spectra have no lines…',
    });
    expect(errorMessage(notRatable, i18n)).toContain('zwischen 10 und 1.000 Hz');
    const unknown = new ApiError(500, '500: boom', { code: 'no_such_code', detail: 'boom' });
    expect(errorMessage(unknown, i18n)).toBe('boom');
  });
});
