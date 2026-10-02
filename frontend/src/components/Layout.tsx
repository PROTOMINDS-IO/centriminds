// Frame of the signed-in pages: a top bar with the logo (a link home) and the
// account menu, above the routed page. Each page gets its own error boundary,
// and a loading state while a lazy page (the workspace) loads.
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useI18n } from '../i18n';
import { useAuthStore } from '../store/authStore';
import { IMPRESSUM } from './brand/impressum';
import LegalDialog from './brand/LegalDialog';
import ProtomindsLogo from './brand/ProtomindsLogo';
import ErrorBoundary from './ErrorBoundary';
import Logo from './Logo';
import { Loading } from './ui/controls';
import { ChevronDownIcon, MachineIcon, SettingsIcon, SignOutIcon } from './ui/icons';

/** A row of the account menu, link or button. */
const ITEM =
  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink-200 transition-colors hover:bg-ink-700/60 hover:text-ink-50 focus-visible:bg-ink-700/60 focus-visible:text-ink-50 focus-visible:outline-hidden aria-[current=page]:text-accent-200';

/** Avatar button with the account's menu: a disclosure of plain links and
 *  buttons. Escape or a click outside closes it (Escape hands focus back to
 *  the button), and so does tabbing past its last item. */
function UserMenu() {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;
  const initials = (user.name || user.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
  const displayName = user.name || user.email.split('@')[0];

  function signOut() {
    setOpen(false);
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (open && next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('app.shell.accountMenu', { name: displayName })}
        title={displayName}
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[180px] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-ink-700/60 focus-visible:ring-2 focus-visible:ring-accent-400/50 focus-visible:outline-hidden sm:max-w-[220px] lg:max-w-[280px]"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-500/20 text-xs font-semibold text-accent-200 ring-1 ring-accent-400/30"
        >
          {initials || '?'}
        </span>
        <span className="hidden truncate text-sm text-ink-200 sm:inline">{displayName}</span>
        <ChevronDownIcon
          size={12}
          className={`hidden shrink-0 text-ink-300 transition-transform sm:block ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 mt-2 w-60 origin-top-right animate-pop overflow-hidden rounded-lg border border-edge/10 bg-ink-800/95 shadow-card-pop backdrop-blur-md"
        >
          <div className="border-b border-edge/10 px-3 py-2.5 text-xs">
            <div className="truncate text-ink-100">{user.name || t('app.shell.signedIn')}</div>
            <div className="truncate text-ink-300">{user.email}</div>
          </div>
          <ul className="py-1">
            <li>
              <NavLink to="/machines" onClick={() => setOpen(false)} className={ITEM}>
                <MachineIcon className="shrink-0" />
                {t('app.machines.title')}
              </NavLink>
            </li>
            <li>
              <NavLink to="/settings" onClick={() => setOpen(false)} className={ITEM}>
                <SettingsIcon className="shrink-0" />
                {t('common.settings')}
              </NavLink>
            </li>
            <li>
              <button type="button" onClick={signOut} className={ITEM}>
                <SignOutIcon className="shrink-0" />
                {t('common.signOut')}
              </button>
            </li>
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-edge/10 px-3 py-2 text-[11px] text-ink-300">
            <a
              href={IMPRESSUM.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-sm hover:text-ink-50"
            >
              <ProtomindsLogo withWordmark className="text-ink-100" />
              <span className="sr-only">{t('app.brand.newTab')}</span>
            </a>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setLegalOpen(true);
              }}
              className="rounded-sm underline underline-offset-2 hover:text-ink-50"
            >
              {t('common.impressum')}
            </button>
          </div>
        </div>
      )}
      {legalOpen && (
        <LegalDialog
          onClose={() => {
            setLegalOpen(false);
            buttonRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-full flex-col bg-ink-950">
      <header className="sticky top-0 z-30 border-b border-ink-700/80 bg-ink-900/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4 lg:px-6 2xl:max-w-(--breakpoint-2xl)">
          <Logo size={28} />
          {/* Keyed by path: whatever was open closes when the page changes. */}
          <UserMenu key={pathname} />
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        {/* Keyed by path: an error on one page clears when the page changes. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
