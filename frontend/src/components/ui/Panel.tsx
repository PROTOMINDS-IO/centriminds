import type { ReactNode } from 'react';

/** A titled section inside a floating card (the analysis sections): a quiet
 *  well that reads the same on the dark and the light theme. */
export default function Panel({
  title,
  meta,
  children,
  className = '',
}: {
  title?: ReactNode;
  /** Short secondary text on the right of the title (counts, units). */
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`space-y-3 rounded-lg border border-edge/[0.08] bg-edge/[0.03] p-3 ${className}`}
    >
      {(title || meta) && (
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title && <h2 className="text-sm font-semibold text-ink-100">{title}</h2>}
          {meta && <span className="text-[11px] text-ink-300">{meta}</span>}
        </header>
      )}
      {children}
    </section>
  );
}
