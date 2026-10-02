// Auth state lives in Zustand with localStorage persistence so a refresh
// keeps the user logged in until the token expires. The API client reads
// the token directly from this store rather than passing it everywhere.
//
// The tabs of a browser share the stored session, while each keeps a copy in
// memory; the storage listener at the end brings a change made in one tab to
// the others.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserRead } from '../api/types';
import { queryClient } from '../lib/queryClient';
import { useSettingsStore } from './settingsStore';

const STORAGE_KEY = 'centriminds.auth';

interface AuthState {
  token: string | null;
  user: UserRead | null;
  setSession: (token: string, user: UserRead) => void;
  /** Carry on the session with a new token for the same account: a password
   *  change ends every session and issues this one a new token. The account
   *  and its settings stay as they are. */
  renewToken: (token: string) => void;
  clearSession: () => void;
}

/** RequireAuth checks each token it has not seen with GET /me, behind a
 *  loading screen. A token issued just now to the account already signed in
 *  needs no check: hand RequireAuth the answer, so the page stays as it is. */
function markChecked(token: string, user: UserRead | null) {
  if (user) queryClient.setQueryData(['me', token], user);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        set({ token, user });
        // The account's settings win when a session starts or is restored.
        if (user.settings) useSettingsStore.getState().adopt(user.settings);
      },
      renewToken: (token) => {
        markChecked(token, get().user);
        set({ token });
      },
      clearSession: () => {
        set({ token: null, user: null });
        // Cached data is not keyed by user: drop it, so whoever signs in next
        // on this tab is never served this account's projects.
        queryClient.clear();
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);

/** Cheap helper for non-React code paths (e.g. the fetch wrapper). */
export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

// Another tab stored a new session: a sign-in, a sign-out, or the token a
// password change brings. Take it over rather than carry on with the old
// token: once the server has ended that one, its 401 would clear the stored
// session (clearSession) and sign the other tab out as well.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  const before = useAuthStore.getState();
  // Synchronous with localStorage, so the lines below run before React
  // renders the new state.
  void useAuthStore.persist.rehydrate();
  const { token, user } = useAuthStore.getState();
  if (token === before.token) return;
  if (token && user?.id === before.user?.id) markChecked(token, user);
  // Signed out, or into another account: drop the cache, as clearSession does.
  else queryClient.clear();
});
