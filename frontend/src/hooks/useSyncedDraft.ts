import { useState } from 'react';

/**
 * Local, editable text for a value that also changes from outside (a saved
 * field, a store value). Typing edits the draft; when `value` changes, the
 * draft resets to it. Uses React's "adjust state while rendering" pattern
 * instead of an effect, so there is no extra render with stale text.
 */
export function useSyncedDraft<T>(value: T, toText: (v: T) => string = String) {
  const [draft, setDraft] = useState(() => toText(value));
  const [synced, setSynced] = useState(value);
  if (!Object.is(value, synced)) {
    setSynced(value);
    setDraft(toText(value));
  }
  return [draft, setDraft] as const;
}
