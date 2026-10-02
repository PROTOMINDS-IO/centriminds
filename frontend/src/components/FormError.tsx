import { useI18n } from '../i18n';
import { errorMessage } from '../lib/errorMessage';

/** Inline error box used by the forms and panels, worded by lib/errorMessage.ts
 *  (in the user's language when the server sent a known error code). */
export default function FormError({ error }: { error: unknown }) {
  const i18n = useI18n();
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger-text"
    >
      {errorMessage(error, i18n)}
    </div>
  );
}
