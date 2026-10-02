import { useState } from 'react';

import { useI18n } from '../../i18n';
import { IMPRESSUM } from './impressum';
import LegalDialog from './LegalDialog';
import ProtomindsLogo from './ProtomindsLogo';

/**
 * Vendor attribution + the legal notice it has to reach, in a quiet
 * proportion: 11px, muted, out of the way of the work.
 */
export default function BuiltBy({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const [legalOpen, setLegalOpen] = useState(false);

  return (
    <>
      <p
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-300 ${className}`}
      >
        <a
          href={IMPRESSUM.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-ink-50"
        >
          <span>{t('common.productBy')}</span>
          <ProtomindsLogo withWordmark className="text-ink-100" />
          <span className="sr-only">{t('app.brand.newTab')}</span>
        </a>
        <span aria-hidden className="text-ink-500">
          ·
        </span>
        <button
          type="button"
          onClick={() => setLegalOpen(true)}
          className="underline underline-offset-2 transition-colors hover:text-ink-50"
        >
          {t('common.impressum')}
        </button>
      </p>
      {legalOpen && <LegalDialog onClose={() => setLegalOpen(false)} />}
    </>
  );
}
