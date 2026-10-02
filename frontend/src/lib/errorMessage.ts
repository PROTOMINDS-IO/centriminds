import { ApiError } from '../api/client';
import type { I18n } from '../i18n';

/** The message to show for a failed request: in the user's language when the
 *  server sent a known error code, else the server's own message. */
export function errorMessage(error: unknown, i18n: I18n): string {
  if (error instanceof ApiError) {
    if (error.code) {
      const text = i18n.tx(`errors.${error.code}`, error.params as Record<string, string | number>);
      if (text) return text;
    }
    return error.detail || i18n.t('errors.generic');
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
