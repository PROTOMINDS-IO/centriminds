import { useId } from 'react';
import type { ReactNode } from 'react';

/** One card of the Settings page: icon, heading, a line saying what it is for. */
export default function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="card space-y-5 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-500/10 text-accent-300 ring-1 ring-accent-400/20"
        >
          {icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 id={headingId} className="text-base font-semibold text-ink-50">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-300">{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/** A setting on one row: name and hint on the left, its control on the right
 *  (stacked on phones). */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-sm text-ink-100">{label}</div>
        {hint && <p className="mt-0.5 text-xs text-ink-300">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
