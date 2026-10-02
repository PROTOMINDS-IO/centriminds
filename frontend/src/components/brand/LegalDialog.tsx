import { useEffect, useId, useRef } from 'react';

import { useI18n, type MessageKey } from '../../i18n';
import { CloseIcon } from '../ui/icons';
import { IMPRESSUM } from './impressum';

const ADDRESS_LABEL: Record<(typeof IMPRESSUM.addresses)[number]['kind'], MessageKey> = {
  business: 'app.legal.businessAddress',
  further: 'app.legal.furtherAddress',
};

/** The Impressum as a modal dialog (a bottom sheet on phones), opened from
 *  the account menu and the vendor line (BuiltBy). Escape, the close button
 *  or a click outside closes it. */
export default function LegalDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus moves into the dialog, and back to whatever opened it afterwards
  // (when that is still on the page).
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Tab') keepFocusIn(dialogRef.current, e);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const partners = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    IMPRESSUM.representedBy,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-0 backdrop-blur-xs sm:items-center sm:p-6 light:bg-edge/40"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-edge/10 bg-ink-900 p-6 shadow-card-pop sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p lang="de" className="text-[11px] tracking-[0.12em] text-ink-300 uppercase">
              {IMPRESSUM.basis}
            </p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-ink-50">
              {t('common.impressum')}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="rounded-md p-1.5 text-ink-300 transition-colors hover:bg-ink-700/60 hover:text-ink-50"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-4 text-sm leading-relaxed text-ink-200">
          <div>
            <p className="font-semibold text-ink-50">{IMPRESSUM.legalName}</p>
            <p className="text-ink-300">{t('app.legal.representedBy', { names: partners })}</p>
          </div>
          {IMPRESSUM.addresses.map((a) => (
            <div key={a.kind}>
              <p className="text-xs font-medium text-ink-300">{t(ADDRESS_LABEL[a.kind])}</p>
              {a.lines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </div>
          ))}
          <div>
            <p className="text-xs font-medium text-ink-300">{t('app.legal.contact')}</p>
            <p>
              <a
                className="text-accent-300 hover:text-accent-200"
                href={`mailto:${IMPRESSUM.email}`}
              >
                {IMPRESSUM.email}
              </a>
            </p>
            <p>
              <a
                className="text-accent-300 hover:text-accent-200"
                href={IMPRESSUM.website}
                target="_blank"
                rel="noopener noreferrer"
              >
                www.protominds.io
                <span className="sr-only"> {t('app.brand.newTab')}</span>
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tab past the last control goes to the first, Shift+Tab before the first
 *  to the last: a modal dialog keeps the focus until it closes. */
function keepFocusIn(dialog: HTMLElement | null, e: KeyboardEvent) {
  if (!dialog) return;
  const items = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = dialog.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
    e.preventDefault();
    first.focus();
  }
}
