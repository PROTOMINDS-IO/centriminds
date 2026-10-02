// Language (EN | DE) and theme (sun | moon) before signing in, in the sign-in
// and sign-up footer. Same settings as the Settings page; what is picked
// here carries over into the session (see ./session.ts).
import type { ReactNode } from 'react';

import { LOCALES, useI18n } from '../../i18n';
import { useResolvedTheme } from '../../lib/theme';
import { LANGUAGE_NAMES } from '../languages';
import { MoonIcon, SunIcon } from '../ui/icons';
import { pickSetting } from './session';

function Choice({
  label,
  lang,
  pressed,
  onClick,
  children,
}: {
  label: string;
  lang?: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      lang={lang}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-2 text-[11px] font-semibold tracking-wider transition-colors focus-visible:ring-2 focus-visible:ring-accent-400/50 focus-visible:outline-hidden ${
        pressed ? 'bg-ink-600 text-ink-50' : 'text-ink-300 hover:text-ink-50'
      }`}
    >
      {children}
    </button>
  );
}

const GROUP = 'inline-flex rounded-md border border-edge/10 bg-ink-900/60 p-0.5 backdrop-blur-sm';

export default function DisplayPrefs({ className = '' }: { className?: string }) {
  const { t, locale } = useI18n();
  const theme = useResolvedTheme();
  return (
    <div
      role="group"
      aria-label={t('app.auth.display')}
      className={`flex items-center gap-2 ${className}`}
    >
      <div role="group" aria-label={t('app.settings.language.title')} className={GROUP}>
        {LOCALES.map((code) => (
          <Choice
            key={code}
            label={LANGUAGE_NAMES[code]}
            lang={code}
            pressed={locale === code}
            onClick={() => pickSetting({ language: code })}
          >
            {code.toUpperCase()}
          </Choice>
        ))}
      </div>
      <div role="group" aria-label={t('app.settings.appearance.title')} className={GROUP}>
        <Choice
          label={t('app.settings.appearance.light')}
          pressed={theme === 'light'}
          onClick={() => pickSetting({ theme: 'light' })}
        >
          <SunIcon size={13} />
        </Choice>
        <Choice
          label={t('app.settings.appearance.dark')}
          pressed={theme === 'dark'}
          onClick={() => pickSetting({ theme: 'dark' })}
        >
          <MoonIcon size={13} />
        </Choice>
      </div>
    </div>
  );
}
