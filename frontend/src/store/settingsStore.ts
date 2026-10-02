// The user's settings (Settings page): theme, language, 3D view defaults.
// They belong to the account (PATCH /api/auth/me) and are mirrored in this
// browser (localStorage), so they apply before sign-in and before the first
// request (public/theme-init.js reads the same key). The server wins when a
// session starts; changes made here are sent to it right away.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UserSettings } from '../api/types';
import { prefersReducedMotion } from '../lib/motion';

export type { UserSettings };
export type ThemeSetting = UserSettings['theme'];
export type LanguageSetting = UserSettings['language'];

/** Same as the backend's defaults (UserSettings in backend/app/schemas.py). */
export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  language: 'auto',
  auto_rotate: null,
  default_view: '3d',
  default_scale: 'linear',
  colormap: 'viridis',
  colour_spread: 'balanced',
};

/** Just the settings of a state (no actions), e.g. to persist or send them.
 *  The keys come from DEFAULT_SETTINGS: a new setting needs only its type
 *  and its default. */
export function settingsOf(state: UserSettings): UserSettings {
  const keys = Object.keys(DEFAULT_SETTINGS) as (keyof UserSettings)[];
  return Object.fromEntries(keys.map((k) => [k, state[k]])) as unknown as UserSettings;
}

interface SettingsState extends UserSettings {
  /** Apply locally now; `sync` (set by the API layer) sends it to the account. */
  update: (patch: Partial<UserSettings>) => void;
  /** Take the account's settings when a session starts or is restored
   *  (authStore.setSession); a key they lack gets its default. */
  adopt: (settings: UserSettings) => void;
}

/** Sends a change to the account; installed by api/client.ts (no import cycle). */
let sync: ((patch: Partial<UserSettings>) => void) | null = null;
export function setSettingsSync(fn: typeof sync) {
  sync = fn;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => {
        set(patch);
        sync?.(patch);
      },
      adopt: (settings) => set({ ...DEFAULT_SETTINGS, ...settings }),
    }),
    {
      name: 'centriminds.settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => settingsOf(state),
    },
  ),
);

/** Idle auto-rotate: the user's choice, else on unless they prefer less motion. */
export function useAutoRotate(): boolean {
  const setting = useSettingsStore((s) => s.auto_rotate);
  return setting ?? !prefersReducedMotion();
}
