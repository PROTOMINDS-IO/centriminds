// One-of-several choice drawn as cards. Underneath they are native radio
// buttons in a fieldset, so arrow keys, the focus ring and screen readers
// ("radio button, 2 of 3, checked") work as for any radio group.
import { useId } from 'react';
import type { ReactNode } from 'react';

import { CheckIcon } from './icons';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  /** Short line under the label. */
  hint?: ReactNode;
  icon?: ReactNode;
  /** Decorative picture above the label, e.g. a theme preview. */
  preview?: ReactNode;
  /** Language of the label when it differs from the page (a language's own name). */
  lang?: string;
}

export default function ChoiceCards<T extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
}: {
  /** Name of the group for assistive technology (the section heading shows it). */
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  /** Grid columns and gaps. */
  className?: string;
}) {
  const id = useId();
  return (
    <fieldset className={`grid min-w-0 ${className}`}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const checked = o.value === value;
        const labelId = `${id}-${o.value}-label`;
        const hintId = `${id}-${o.value}-hint`;
        return (
          <label
            key={o.value}
            className={`relative flex min-w-0 cursor-pointer flex-col gap-2 rounded-lg border p-2.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-accent-400/50 sm:p-3 ${
              checked
                ? 'border-accent-400/70 bg-accent-500/10'
                : 'border-edge/10 bg-ink-900/40 hover:border-ink-500'
            }`}
          >
            <input
              type="radio"
              className="sr-only"
              name={id}
              value={o.value}
              checked={checked}
              onChange={() => onChange(o.value)}
              aria-labelledby={labelId}
              aria-describedby={o.hint ? hintId : undefined}
            />
            {o.preview}
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-50">
              {o.icon && (
                <span
                  className={`shrink-0 ${
                    // Cards in a row are narrow on phones; a preview shows as much.
                    o.preview ? 'hidden sm:inline-flex' : 'inline-flex'
                  } ${checked ? 'text-accent-300' : 'text-ink-300'}`}
                >
                  {o.icon}
                </span>
              )}
              <span id={labelId} lang={o.lang} className="min-w-0 break-words">
                {o.label}
              </span>
              {checked && (
                <CheckIcon
                  size={14}
                  strokeWidth={2.5}
                  className="ml-auto shrink-0 text-accent-300"
                />
              )}
            </span>
            {o.hint && (
              <span id={hintId} className="-mt-1 text-xs text-ink-300">
                {o.hint}
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
