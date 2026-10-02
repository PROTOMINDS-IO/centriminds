// What the backend accepts for a new password (the limits in
// backend/app/auth.py, applied by `NewPassword` in backend/app/schemas.py),
// checked before sending so the message is in the user's language.
import type { I18n } from '../../i18n';

export const PASSWORD_MIN = 8;
/** bcrypt's limit, in UTF-8 bytes: "ä" counts as two. */
const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = 'tooShort' | 'tooLong' | 'mismatch';

/** The first thing wrong with a new password and its confirmation, if any. */
export function checkNewPassword(password: string, confirm: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return 'tooShort';
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'tooLong';
  if (password !== confirm) return 'mismatch';
  return null;
}

/** What to tell the user about a problem, in their language. */
export function passwordProblemText(problem: PasswordProblem, t: I18n['t']): string {
  return t(`app.password.${problem}`, { min: PASSWORD_MIN, max: PASSWORD_MAX_BYTES });
}
