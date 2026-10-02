// Inputs that edit a draft and save when the user leaves the field, never on
// every keystroke. The draft follows the saved value when it changes from
// outside, so a refetch does not leave stale text behind.
import { useRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

import { useSyncedDraft } from '../../hooks/useSyncedDraft';

type CommonProps = {
  value: string;
  /** Called with the new text when it differs from `value`. */
  onCommit: (next: string) => void;
};

/** Single-line field: blur or Enter saves, Escape discards the edit. */
export function CommitInput({
  value,
  onCommit,
  ...rest
}: CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [draft, setDraft] = useSyncedDraft(value);
  // Escape leaves the field through blur(), whose handler runs at once with
  // the edited draft still in scope; this tells it not to save.
  const cancelled = useRef(false);
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (cancelled.current) cancelled.current = false;
        else if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** Multi-line field: saves on blur only, as Enter starts a new line. */
export function CommitTextarea({
  value,
  onCommit,
  ...rest
}: CommonProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [draft, setDraft] = useSyncedDraft(value);
  return (
    <textarea
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
    />
  );
}
