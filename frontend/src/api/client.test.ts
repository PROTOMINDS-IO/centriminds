import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS } from '../store/settingsStore';
import { api } from './client';
import type { UserRead } from './types';

const alice: UserRead = {
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
  created_at: '',
  settings: DEFAULT_SETTINGS,
};
const bob: UserRead = {
  id: 2,
  email: 'bob@example.com',
  name: 'Bob',
  created_at: '',
  settings: DEFAULT_SETTINGS,
};

const rejected = async () =>
  new Response(JSON.stringify({ detail: 'Token expired' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

/** An upload the server turns down with a 401. */
class RejectedUpload {
  status = 401;
  statusText = 'Unauthorized';
  responseText = JSON.stringify({ detail: 'Token expired' });
  upload = {};
  onload: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  send() {
    setTimeout(() => this.onload?.());
  }
}

beforeEach(() => {
  useAuthStore.getState().setSession('alice-token', alice);
  queryClient.setQueryData(['projects'], [{ id: 1, name: 'Alice’s decanter' }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.getState().clearSession();
});

describe('api client on 401', () => {
  it('signs out and forgets everything cached', async () => {
    vi.stubGlobal('fetch', vi.fn(rejected));
    await expect(api.listProjects()).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().token).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('does the same for an upload', async () => {
    vi.stubGlobal('XMLHttpRequest', RejectedUpload);
    await expect(api.createProject(new FormData())).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().token).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('leaves alone a session that began while the request was out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        useAuthStore.getState().clearSession();
        useAuthStore.getState().setSession('bob-token', bob);
        queryClient.setQueryData(['projects'], [{ id: 2, name: 'Bob’s decanter' }]);
        return rejected();
      }),
    );
    await expect(api.listProjects()).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().token).toBe('bob-token');
    expect(queryClient.getQueryData(['projects'])).toEqual([{ id: 2, name: 'Bob’s decanter' }]);
  });
});

describe('api client without a connection', () => {
  it('reports a network error the UI can translate, and keeps the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(api.listProjects()).rejects.toMatchObject({ status: 0, code: 'network' });
    expect(useAuthStore.getState().token).toBe('alice-token');
  });
});
