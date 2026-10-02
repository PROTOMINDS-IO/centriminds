// Small inputs of the profile editor: cells of its tables that edit one
// value of the draft document.
import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';

import { FIELD_SURFACE } from '../ui/controls';

const CELL = `w-full min-w-0 px-2 py-1 text-base disabled:opacity-60 sm:text-sm aria-[invalid=true]:border-danger ${FIELD_SURFACE}`;

/** A text cell. */
export function TextCell({
  value,
  onChange,
  className = '',
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${CELL} ${className}`}
    />
  );
}

/**
 * A number cell. It keeps what is typed ("1.", "-") while it is not a
 * number yet and reports only numbers (null when emptied and `optional`);
 * a value changed from outside replaces the text.
 */
export function NumberCell({
  value,
  onChange,
  optional = false,
  className = '',
  ...rest
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  optional?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const shown = value == null ? '' : String(value);
  const [text, setText] = useState(shown);
  // A new value from outside replaces the text, unless the text already
  // says it ("1.0" for 1); adjusted while rendering (see useSyncedDraft).
  const [synced, setSynced] = useState(value);
  if (!Object.is(value, synced)) {
    setSynced(value);
    if (text.trim() === '' || Number(text) !== value) setText(shown);
  }
  const valid = text.trim() === '' ? optional : Number.isFinite(Number(text));
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      aria-invalid={!valid || undefined}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        if (next.trim() === '') {
          if (optional) onChange(null);
        } else if (Number.isFinite(Number(next))) {
          onChange(Number(next));
        }
      }}
      className={`${CELL} text-right font-mono tabular-nums ${className}`}
    />
  );
}

export const SELECT_CELL = `${CELL} select py-1`;
