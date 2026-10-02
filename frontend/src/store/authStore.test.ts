import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { UserRead } from '../api/types';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from './authStore';
import { DEFAULT_SETTINGS } from './settingsStore';

const alice: UserRead = {
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
  created_at: '',
  settings: DEFAULT_SETTINGS,
};
const bob: UserRead = { ...alice, id: 2, email: 'bob@example.com', name: 'Bob' };

/** What another tab of this browser does when its session changes: it stores
 *  the session, and this tab is told with a storage event. */
function storedByOtherTab(token: string | null, user: UserRead | null) {
  const value = JSON.stringify({ state: { token, user }, version: 0 });
  localStorage.setItem('centriminds.auth', value);
  window.dispatchEvent(new StorageEvent('storage', { key: 'centriminds.auth', newValue: value }));
}

const stored = () => JSON.parse(localStorage.getItem('centriminds.auth') ?? 'null')?.state;

beforeEach(() => {
  useAuthStore.getState().setSession('alice-token', alice);
  queryClient.setQueryData(['projects'], [{ id: 1, name: 'Alice’s decanter' }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
});

describe('a new token for the same account', () => {
  it('replaces the old one here and in storage, and keeps the cache', () => {
    useAuthStore.getState().renewToken('alice-token-2');

    expect(useAuthStore.getState()).toMatchObject({ token: 'alice-token-2', user: alice });
    expect(stored()).toEqual({ token: 'alice-token-2', user: alice });
    expect(queryClient.getQueryData(['projects'])).toBeDefined();
    // RequireAuth has its answer, so it does not swap the page for a loading
    // screen to check the token.
    expect(queryClient.getQueryData(['me', 'alice-token-2'])).toEqual(alice);
  });
});

describe('the session other tabs store', () => {
  it('takes the new token of a password change made there', () => {
    storedByOtherTab('alice-token-2', alice);

    expect(useAuthStore.getState().token).toBe('alice-token-2');
    expect(queryClient.getQueryData(['me', 'alice-token-2'])).toEqual(alice);
    expect(queryClient.getQueryData(['projects'])).toBeDefined();
  });

  it('keeps it when a request with the old token is refused', async () => {
    // The password change there ended the token this request went out with.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        storedByOtherTab('alice-token-2', alice);
        return new Response(JSON.stringify({ detail: 'Session ended' }), { status: 401 });
      }),
    );
    await expect(api.listProjects()).rejects.toMatchObject({ status: 401 });

    expect(useAuthStore.getState().token).toBe('alice-token-2');
    expect(stored()).toEqual({ token: 'alice-token-2', user: alice });
  });

  it('signs out when another tab does, and forgets everything cached', () => {
    storedByOtherTab(null, null);

    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null });
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('drops the cache when another tab signs in to another account', () => {
    storedByOtherTab('bob-token', bob);

    expect(useAuthStore.getState()).toMatchObject({ token: 'bob-token', user: bob });
    // Nothing of Alice's, and no answer for RequireAuth: it checks Bob's token.
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('ignores the other things stored', () => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'centriminds.settings' }));

    expect(useAuthStore.getState().token).toBe('alice-token');
    expect(queryClient.getQueryData(['projects'])).toBeDefined();
  });
});
