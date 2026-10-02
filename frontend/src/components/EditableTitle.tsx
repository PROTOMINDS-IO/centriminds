// Click-to-rename inline editor: Enter or blur commits, Escape reverts. A
// failed save keeps the field open with the reason under it.
import { useId, useState } from 'react';

import { useI18n } from '../i18n';
import { errorMessage } from '../lib/errorMessage';
import { FOCUS_RING } from './ui/controls';
import { PencilIcon } from './ui/icons';

interface Props {
  value: string;
  /** Saves the trimmed text; called only when it is not empty and changed.
   *  The field is disabled while it runs; if it rejects, the field stays open
   *  and shows the error. */
  onCommit: (next: string) => Promise<unknown> | unknown;
  className?: string;
  /** Shown for an empty name; defaults to "Untitled". */
  placeholder?: string;
}

export default function EditableTitle({ value, onCommit, className = '', placeholder }: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  // The draft only exists while editing, seeded from the current value.
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const errorId = useId();
  const empty = placeholder ?? t('workspace.title.untitled');

  function close() {
    setDraft(null);
    setError(null);
  }

  async function commit() {
    if (draft === null) return;
    const next = draft.trim();
    if (!next || next === value) {
      close();
      return;
    }
    setBusy(true);
    try {
      await onCommit(next);
      close();
    } catch (err) {
      // Keep the text for a retry.
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(value)}
        className={`group flex max-w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-edge/[0.07] ${FOCUS_RING} ${className}`}
        title={t('workspace.title.rename')}
      >
        <span className="truncate">{value || empty}</span>
        <PencilIcon
          size={12}
          className="shrink-0 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </button>
    );
  }

  return (
    <span className="flex w-full min-w-0 flex-col gap-1">
      <input
        // Focus the field as it replaces the button.
        ref={(el) => {
          if (el && document.activeElement !== el) {
            el.focus();
            el.select();
          }
        }}
        aria-label={t('workspace.title.label')}
        aria-invalid={error !== null || undefined}
        aria-describedby={error !== null ? errorId : undefined}
        value={draft}
        disabled={busy}
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          } else if (e.key === 'Escape') {
            close();
          }
        }}
        className={`w-full min-w-0 rounded-md border border-accent-400/50 bg-ink-800 px-2 py-0.5 ring-2 ring-accent-400/30 outline-hidden ${className}`}
        placeholder={empty}
      />
      {error !== null && (
        <span id={errorId} role="alert" className="text-xs font-normal text-danger-text">
          {errorMessage(error, i18n)}
        </span>
      )}
    </span>
  );
}
