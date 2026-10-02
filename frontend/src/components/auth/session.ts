// Starting a session from the sign-in and sign-up pages.
//
// A session normally takes the account's settings (authStore.setSession). A
// language or theme picked on the sign-in page a moment ago is the user's
// latest word, though, so it is kept and saved to the account; a new account
// starts with whatever this browser already uses.
import { api } from '../../api/client';
import type { TokenResponse, UserSettings } from '../../api/types';
import { queryClient } from '../../lib/queryClient';
import { useAuthStore } from '../../store/authStore';
import { settingsOf, useSettingsStore } from '../../store/settingsStore';

/** Settings chosen on the sign-in or sign-up page, for the next session. */
let picked: Partial<UserSettings> = {};

/** Apply a setting chosen before signing in, and remember it for the account. */
export function pickSetting(patch: Partial<UserSettings>) {
  picked = { ...picked, ...patch };
  useSettingsStore.getState().update(patch);
}

function browserSettings(): UserSettings {
  return settingsOf(useSettingsStore.getState());
}

/** Begin the session a sign-in or sign-up returned. */
export function startSession(
  { access_token, user }: TokenResponse,
  { newAccount = false }: { newAccount?: boolean } = {},
) {
  const keep = newAccount ? browserSettings() : picked;
  picked = {};
  const session = { ...user, settings: { ...user.settings, ...keep } };
  // RequireAuth checks a stored token with GET /me; this one was issued just
  // now, so hand it the answer (which also means a /me racing the save below
  // cannot bring back the settings being replaced).
  queryClient.setQueryData(['me', access_token], session);
  useAuthStore.getState().setSession(access_token, session);
  if (Object.keys(keep).length > 0) api.updateMe({ settings: keep }).catch(() => {});
}
