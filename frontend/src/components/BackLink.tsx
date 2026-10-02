import { Link } from 'react-router';

import { useI18n } from '../i18n';
import { ChevronLeftIcon } from './ui/icons';

/** "‹ Projects" above the title of an inner page (Upload, Settings): the way
 *  back to the project list, or to `to` with its `label`. */
export default function BackLink({
  className = '',
  to = '/',
  label,
  ariaLabel,
}: {
  className?: string;
  to?: string;
  label?: string;
  ariaLabel?: string;
}) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? (label ? undefined : t('common.backToProjects'))}
      className={`-ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-300 transition-colors hover:bg-ink-700/60 hover:text-ink-50 focus-visible:ring-2 focus-visible:ring-accent-400/50 focus-visible:outline-hidden ${className}`}
    >
      <ChevronLeftIcon size={12} />
      {label ?? t('common.projects')}
    </Link>
  );
}
