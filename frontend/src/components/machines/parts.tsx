// Layout pieces of the profile editor: its sections, labelled fields,
// tables and the small buttons of their rows and of the toolbar. The cells
// that edit values are in fields.tsx.
import type { ReactNode } from 'react';

import { FOCUS_RING } from '../ui/controls';
import { CloseIcon, PlusIcon } from '../ui/icons';

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-edge/10 bg-ink-800 p-4 shadow-card">
      <header>
        <h2 className="text-base font-semibold text-ink-50">{title}</h2>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-300">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

export function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-ink-400">{hint}</span>}
    </label>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[36rem] border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-[11px] text-ink-300">
            {head.map((h, i) => (
              <th key={i} className="px-1 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ className = '', children }: { className?: string; children: ReactNode }) {
  return <td className={`align-top ${className}`}>{children}</td>;
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-accent-300 hover:text-accent-200 disabled:hidden ${FOCUS_RING}`}
    >
      <PlusIcon size={12} strokeWidth={2.5} />
      {label}
    </button>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <RowIcon label={label} onClick={onClick} danger>
      <CloseIcon size={12} strokeWidth={2.5} />
    </RowIcon>
  );
}

export function RowIcon({
  label,
  onClick,
  disabled,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-md p-1.5 text-ink-400 disabled:opacity-30 ${danger ? 'hover:text-danger-text' : 'hover:text-ink-50'} ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}

export function IconAction({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-md p-2 text-ink-300 hover:bg-edge/[0.06] ${danger ? 'hover:text-danger-text' : 'hover:text-ink-50'} ${FOCUS_RING}`}
    >
      {children}
    </button>
  );
}
