// The floating chrome over the 3D view. The measurement card (left) and the
// view card (right) share this skin; what either expands opens inside the
// card on wide screens and as a bottom sheet on phones.
import type { CSSProperties, ReactNode } from 'react';

import { useI18n } from '../../i18n';
import { CloseButton } from '../ui/controls';
import type { Side } from './chrome';

/** A card in a top corner of the view. It hugs its content, and widens to
 *  at least `widthRem` while `expanded` (smoothly where the browser can:
 *  .card-grow in index.css). Expanded content should not widen the card:
 *  give it `w-0 min-w-full`. */
export function FloatingCard({
  side,
  label,
  widthRem,
  expanded = false,
  reserveBottomRem,
  className = '',
  children,
}: {
  side: Side;
  label: string;
  widthRem?: number;
  expanded?: boolean;
  /** Keep this much of the view's bottom free (the colour legend). */
  reserveBottomRem?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-chrome={side}
      data-expanded={expanded && widthRem !== undefined}
      aria-label={label}
      className={`float card-grow pointer-events-auto absolute top-3 z-20 flex max-h-[calc(100%-1.5rem)] flex-col rounded-xl ${
        side === 'left' ? 'left-3' : 'right-3'
      } ${className}`}
      style={{
        ...(widthRem ? ({ '--card-w': `${widthRem}rem` } as CSSProperties) : {}),
        ...(reserveBottomRem ? { maxHeight: `calc(100% - 0.75rem - ${reserveBottomRem}rem)` } : {}),
      }}
    >
      {children}
    </section>
  );
}

/** A card's expanded content on phones: a sheet that slides up along the
 *  bottom edge with its own title and close button (the card stays visible
 *  above it). `exiting` plays the slide back down (usePresence). */
export function Sheet({
  side,
  title,
  onClose,
  exiting = false,
  children,
}: {
  side: Side;
  title: string;
  onClose: () => void;
  exiting?: boolean;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section
      data-chrome={side}
      aria-label={title}
      className={`float pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex max-h-[75dvh] flex-col rounded-t-2xl shadow-card-pop ${
        exiting ? 'animate-sheet-out' : 'animate-sheet-in'
      }`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-edge/10 py-1.5 pr-1.5 pl-4">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-50">{title}</h2>
        <CloseButton label={t('workspace.chrome.close', { name: title })} onClick={onClose} />
      </header>
      <div className="min-h-0 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </section>
  );
}
