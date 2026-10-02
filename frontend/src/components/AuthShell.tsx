// Shared frame for the sign-in and registration screens.
//
// Phones get one column: a compact brand header, the form card, and the
// footer — all within the dynamic viewport so nothing hides behind the
// browser chrome. From `lg` up the brand gets its own panel on the left. The
// footer is the same everywhere: a row of its own across the bottom, language
// and theme above the vendor line, centred on the page. The CentriMinds mark
// appears exactly once per layout.
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useI18n } from '../i18n';
import { prefersReducedMotion } from '../lib/motion';
import DisplayPrefs from './auth/DisplayPrefs';
import BuiltBy from './brand/BuiltBy';
import ErrorBoundary from './ErrorBoundary';
import { DotMark } from './Logo';
import { OdxChip, RichText } from './ui/RichText';

// Decorative and three.js-based (~240 kB compressed, and drawn 60 times a
// second): fetched only once the page is idle, so sign-in paints at once.
const IsoBackground = lazy(() => import('./IsoBackground'));

/** Whether the animated backdrop shows: never under reduced motion or a data
 *  saver (it would only cost), else from the first idle moment after the
 *  page is up. */
function useBackdrop(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    if (prefersReducedMotion() || connection?.saveData) return;
    const start = () => setShow(true);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(start, 500);
    return () => window.clearTimeout(id);
  }, []);
  return show;
}

const CAPABILITIES = ['rating', 'sources', 'modes'] as const;

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-[0.22em] text-ink-50 ${className}`}>CENTRIMINDS</span>
  );
}

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Small line under the form, e.g. the link to the other auth screen. */
  footer: ReactNode;
}) {
  const { t } = useI18n();
  const backdrop = useBackdrop();
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-ink-950">
      {/* Without WebGL the page simply goes without its backdrop. */}
      {backdrop && (
        <ErrorBoundary fallback={() => null}>
          <Suspense fallback={null}>
            <IsoBackground intensity={0.55} />
          </Suspense>
        </ErrorBoundary>
      )}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-ink-950/85 via-ink-950/55 to-ink-950/95" />

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-(--breakpoint-2xl) flex-col">
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-5">
          {/* ── Brand panel (desktop) ───────────────────────────────── */}
          <aside className="hidden flex-col justify-center p-12 lg:col-span-3 lg:flex">
            <div className="max-w-xl space-y-7">
              <div className="flex items-center gap-4">
                <DotMark size={84} intensity={0.16} hovered={false} animate />
                <Wordmark className="text-3xl xl:text-4xl" />
              </div>
              <h1 className="text-4xl leading-tight font-semibold text-ink-50">
                <RichText
                  text={t('app.auth.heroTitle')}
                  parts={{ em: <span className="text-accent-300">{t('app.auth.heroEm')}</span> }}
                />
              </h1>
              <p className="max-w-lg text-base leading-relaxed text-ink-300">
                <RichText text={t('app.auth.heroBody')} parts={{ odx: <OdxChip /> }} />
              </p>
              <ul className="space-y-2 text-sm text-ink-200">
                {CAPABILITIES.map((c) => (
                  <li key={c} className="flex items-center gap-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" aria-hidden />
                    {t(`app.auth.capabilities.${c}`)}
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* ── Form column ─────────────────────────────────────────── */}
          <main className="flex flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-8 sm:px-6 lg:col-span-2 lg:py-12">
            {/* Compact brand header (phones + tablets) */}
            <header className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
              <DotMark size={56} intensity={0.14} hovered={false} />
              <Wordmark className="text-lg" />
              <p className="max-w-xs text-sm text-ink-300">{t('app.auth.tagline')}</p>
            </header>

            <div className="flex flex-1 items-start justify-center lg:items-center">
              <div className="card-glass w-full max-w-sm space-y-6 p-6 sm:p-7">
                <div className="space-y-1">
                  <h2 className="text-xl font-semibold text-ink-50">{title}</h2>
                  <p className="text-sm text-ink-300">{subtitle}</p>
                </div>
                {children}
                <div className="text-center text-xs text-ink-300">{footer}</div>
              </div>
            </div>
          </main>
        </div>

        <footer className="flex flex-col items-center gap-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:pb-10">
          <DisplayPrefs />
          <BuiltBy className="justify-center" />
        </footer>
      </div>
    </div>
  );
}
