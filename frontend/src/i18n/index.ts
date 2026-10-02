// Translations and locale-aware formatting.
//
//   const { t, fmt } = useI18n();
//   t('common.save')                       → "Save" / "Speichern"
//   t('app.dashboard.count', { count: 3 }) → plural entry { one, other }
//   t('errors.file_too_large', { max_mb: 100 })
//   fmt.mmS(11.46)                         → "11.5 mm/s" / "11,5 mm/s"
//
// English (./en) is the source: every key exists there, and the German
// dictionary (./de) is typed against it, so a missing translation does not
// compile. Placeholders are {name}; numbers passed in are formatted for the
// locale. Plural entries are { one, other } objects, picked with
// Intl.PluralRules on `count`.
import { useEffect, useMemo } from 'react';

import { useSettingsStore, type LanguageSetting } from '../store/settingsStore';
import { de } from './de';
import { en, type Messages } from './en';

export type Locale = 'en' | 'de';
export const LOCALES: Locale[] = ['en', 'de'];

type Plural = { one: string; other: string };
type Vars = Record<string, string | number | null | undefined>;

/** Dotted key of a message, e.g. 'workspace.view.top'. */
export type MessageKey = KeyPaths<Messages>;
type KeyPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : KeyPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

const DICTS: Record<Locale, Messages> = { en, de };

/** 'auto' → the browser's first language if it is German, else English. */
export function resolveLocale(setting: LanguageSetting): Locale {
  if (setting === 'en' || setting === 'de') return setting;
  const nav =
    (typeof navigator !== 'undefined' && (navigator.languages?.[0] ?? navigator.language)) || 'en';
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

function lookup(dict: unknown, key: string): string | Plural | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node && 'other' in node) return node as Plural;
  return undefined;
}

/** U+00A0: keeps a number and its unit on one line. */
const NBSP = ' ';

function makeI18n(locale: Locale) {
  const dict = DICTS[locale];
  const plurals = new Intl.PluralRules(locale);
  const numberFormats = new Map<string, Intl.NumberFormat>();
  const nf = (min: number, max: number) => {
    const k = `${min}-${max}`;
    let f = numberFormats.get(k);
    if (!f) {
      f = new Intl.NumberFormat(locale, {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
      });
      numberFormats.set(k, f);
    }
    return f;
  };

  const interpolate = (text: string, vars?: Vars) =>
    vars
      ? text.replace(/\{(\w+)\}/g, (m, name: string) => {
          const v = vars[name];
          if (v === undefined || v === null) return m;
          return typeof v === 'number' ? nf(0, 2).format(v) : v;
        })
      : text;

  const resolve = (key: string, vars?: Vars): string | null => {
    const leaf = lookup(dict, key) ?? lookup(en, key);
    if (leaf === undefined) return null;
    if (typeof leaf === 'string') return interpolate(leaf, vars);
    const count = Number(vars?.count ?? 0);
    const form = plurals.select(count) as keyof Plural;
    return interpolate(leaf[form] ?? leaf.other, vars);
  };

  /** Translate a known key. */
  const t = (key: MessageKey, vars?: Vars): string => resolve(key, vars) ?? key;

  /** Translate a key built at runtime (e.g. an API error code); null if unknown. */
  const tx = (key: string, vars?: Vars): string | null => resolve(key, vars);

  const number = (v: number, digits?: number) =>
    digits === undefined ? nf(0, 2).format(v) : nf(digits, digits).format(v);

  const velocity = (v: number) =>
    v !== 0 && Math.abs(v) < 0.1
      ? new Intl.NumberFormat(locale, { maximumSignificantDigits: 2 }).format(v)
      : number(v, Math.abs(v) >= 10 ? 1 : 2);

  const relativeFormat = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTimeFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const fmt = {
    number,
    /** Velocity with sensible precision: 11.5 · 7.78 · 0.0034 mm/s. */
    mmS: (v: number) => `${velocity(v)}${NBSP}mm/s`,
    /** The number part of mmS, for places that show the unit separately. */
    mmSValue: (v: number) => velocity(v),
    rpm: (v: number) => `${number(v, 0)}${NBSP}${t('units.rpm')}`,
    hz: (v: number, digits = 1) => `${number(v, digits)}${NBSP}Hz`,
    /** "120–3,200 rpm" / "120–3.200 U/min" */
    rpmRange: (lo: number, hi: number) =>
      `${number(lo, 0)}–${number(hi, 0)}${NBSP}${t('units.rpm')}`,
    hzRange: (lo: number, hi: number) => `${number(lo, 0)}–${number(hi, 0)}${NBSP}Hz`,
    date: (iso: string | Date) => dateFormat.format(new Date(iso)),
    dateTime: (iso: string | Date) => dateTimeFormat.format(new Date(iso)),
    /** "3 hours ago" / "vor 3 Stunden" */
    relative(iso: string | Date) {
      const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
      // Each unit with how many of it make the next (a month is ~4.35 weeks).
      const steps: [Intl.RelativeTimeFormatUnit, number][] = [
        ['second', 60],
        ['minute', 60],
        ['hour', 24],
        ['day', 7],
        ['week', 4.35],
        ['month', 12],
        ['year', Infinity],
      ];
      let value = seconds;
      for (const [unit, size] of steps) {
        if (Math.abs(value) < size) return relativeFormat.format(Math.round(value), unit);
        value /= size;
      }
      return relativeFormat.format(Math.round(value), 'year');
    },
  };

  return { locale, t, tx, fmt };
}

export type I18n = ReturnType<typeof makeI18n>;

const cache = new Map<Locale, I18n>();
function i18nFor(locale: Locale): I18n {
  let i = cache.get(locale);
  if (!i) {
    i = makeI18n(locale);
    cache.set(locale, i);
  }
  return i;
}

/** Translation and formatting for the current language (re-renders on change). */
export function useI18n(): I18n {
  const setting = useSettingsStore((s) => s.language);
  const locale = resolveLocale(setting);
  return useMemo(() => i18nFor(locale), [locale]);
}

/** Same, outside React (e.g. building an error message in a callback). */
export function getI18n(): I18n {
  return i18nFor(resolveLocale(useSettingsStore.getState().language));
}

/** Mounted once (main.tsx): keeps <html lang> in step with the language. */
export function LocaleSync() {
  const { locale } = useI18n();
  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
  }, [locale]);
  return null;
}
