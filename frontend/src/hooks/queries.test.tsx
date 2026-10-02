import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { ProjectDetail, ProjectSummary, UserRead } from '../api/types';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import {
  useAnalyzeProject,
  useChangePassword,
  useCreateProject,
  useDeleteProject,
  useLatestPhysics,
  useProject,
  useProjects,
  useSignOutEverywhere,
  useSpectrogramPreview,
  useThumbnail,
  useUpdateMe,
  useUpdateProject,
} from './queries';

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

/** A stand-in API payload, tagged with the file it was read from. */
const from = <T,>(file: string) => ({ file }) as unknown as T;

/** Answers every per-project request with data from `file`. */
function serve(file: string) {
  vi.spyOn(api, 'getProject').mockResolvedValue(from(file));
  vi.spyOn(api, 'getSpectrogramPreview').mockResolvedValue(from(file));
  vi.spyOn(api, 'getThumbnail').mockResolvedValue(from(file));
  vi.spyOn(api, 'listAnalyses').mockResolvedValue([from(file)]);
}

/** Everything the workspace and the project list read for one project. */
function useProjectData(id: number) {
  return {
    project: useProject(id).data,
    preview: useSpectrogramPreview(id).data,
    thumbnail: useThumbnail(id).data,
    physics: useLatestPhysics(id).data,
  };
}

async function load(id: number) {
  const view = renderHook(() => useProjectData(id), { wrapper });
  await waitFor(() => expect(Object.values(view.result.current).every(Boolean)).toBe(true));
  return view;
}

const nothing = {
  project: undefined,
  preview: undefined,
  thumbnail: undefined,
  physics: undefined,
};

/** The project list in miniature: a thumbnail and a delete button per row. */
function ProjectList() {
  const { data } = useProjects();
  const del = useDeleteProject();
  return (
    <div>
      <p>{del.status}</p>
      {data?.map((p) => (
        <ProjectRow key={p.id} id={p.id} onDelete={() => del.mutate(p.id)} />
      ))}
    </div>
  );
}

function ProjectRow({ id, onDelete }: { id: number; onDelete: () => void }) {
  useThumbnail(id);
  return <button onClick={onDelete}>Delete {id}</button>;
}

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
});
afterEach(() => {
  qc.clear();
  vi.restoreAllMocks();
});

describe('project cache', () => {
  it('forgets a deleted project, so the next one to get its id starts empty', async () => {
    serve('old.odx');
    (await load(2)).unmount();
    (await load(3)).unmount();

    vi.spyOn(api, 'deleteProject').mockResolvedValue({ deleted: 2 });
    const del = renderHook(() => useDeleteProject(), { wrapper });
    await act(() => del.result.current.mutateAsync(2));

    serve('new.odx');
    const next = renderHook(() => useProjectData(2), { wrapper });
    expect(next.result.current).toEqual(nothing);
    await waitFor(() => expect(next.result.current.preview).toEqual(from('new.odx')));
    // Other projects keep theirs.
    const other = renderHook(() => useProjectData(3), { wrapper });
    expect(other.result.current.preview).toEqual(from('old.odx'));
  });

  it('drops whatever is cached under the id an upload gets', async () => {
    serve('old.odx');
    (await load(2)).unmount();

    vi.spyOn(api, 'createProject').mockResolvedValue({ id: 2 } as ProjectDetail);
    const create = renderHook(() => useCreateProject(), { wrapper });
    await act(() => create.result.current.mutateAsync({ form: new FormData() }));

    serve('new.odx');
    const next = renderHook(() => useProjectData(2), { wrapper });
    expect(next.result.current).toEqual(nothing);
  });

  it('removes a deleted row without refetching its data', async () => {
    let rows = [{ id: 1 }, { id: 2 }] as ProjectSummary[];
    // The list answers a moment later, as over the network.
    vi.spyOn(api, 'listProjects').mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(rows), 20)),
    );
    vi.spyOn(api, 'deleteProject').mockImplementation(async (id) => {
      rows = rows.filter((p) => p.id !== id);
      return { deleted: id };
    });
    vi.spyOn(api, 'getThumbnail').mockResolvedValue(from('thumb'));

    render(<ProjectList />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete 2' }));

    await screen.findByText('success');
    expect(screen.queryByRole('button', { name: 'Delete 2' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete 1' })).toBeInTheDocument();
    expect(vi.mocked(api.getThumbnail).mock.calls.filter(([id]) => id === 2)).toHaveLength(1);
  });

  it('refreshes the rating and details after a change, not the spectrum', async () => {
    serve('old.odx');
    await load(2);
    vi.spyOn(api, 'analyzeProject').mockResolvedValue(from('run'));
    vi.spyOn(api, 'updateProject').mockResolvedValue(from('new.odx'));

    const analyze = renderHook(() => useAnalyzeProject(2), { wrapper });
    await act(() => analyze.result.current.mutateAsync({}));
    await waitFor(() => expect(api.listAnalyses).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getProject).toHaveBeenCalledTimes(2));

    const update = renderHook(() => useUpdateProject(), { wrapper });
    await act(() => update.result.current.mutateAsync({ id: 2, body: { name: 'Renamed' } }));
    await waitFor(() => expect(api.getProject).toHaveBeenCalledTimes(3));

    expect(api.listAnalyses).toHaveBeenCalledTimes(2);
    expect(api.getSpectrogramPreview).toHaveBeenCalledOnce();
    expect(api.getThumbnail).toHaveBeenCalledOnce();
  });
});

describe('account', () => {
  const alice: UserRead = {
    id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    created_at: '',
    settings: DEFAULT_SETTINGS,
  };
  afterEach(() => {
    useAuthStore.getState().clearSession();
    useSettingsStore.setState(DEFAULT_SETTINGS);
  });

  it('keeps the saved name, and this browser’s newer settings', async () => {
    useAuthStore.getState().setSession('alice-token', alice);
    vi.spyOn(api, 'updateMe').mockImplementation(async () => {
      // Chosen while the rename was on its way (and saved by its own request).
      useSettingsStore.setState({ theme: 'light' });
      return { ...alice, name: 'Alice Smith', settings: { ...DEFAULT_SETTINGS, theme: 'dark' } };
    });
    const { result } = renderHook(() => useUpdateMe(), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Alice Smith' }));

    expect(api.updateMe).toHaveBeenCalledWith({ name: 'Alice Smith' });
    expect(useAuthStore.getState().user?.name).toBe('Alice Smith');
    expect(useAuthStore.getState().token).toBe('alice-token');
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('ignores the reply once another account is signed in', async () => {
    useAuthStore.getState().setSession('alice-token', alice);
    const bob = { ...alice, id: 2, email: 'bob@example.com', name: 'Bob' };
    vi.spyOn(api, 'updateMe').mockImplementation(async () => {
      useAuthStore.getState().clearSession();
      useAuthStore.getState().setSession('bob-token', bob);
      return { ...alice, name: 'Alice Smith' };
    });
    const { result } = renderHook(() => useUpdateMe(), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Alice Smith' }));

    expect(useAuthStore.getState().user).toEqual(bob);
    expect(useAuthStore.getState().token).toBe('bob-token');
  });
});

describe('sessions', () => {
  const alice: UserRead = {
    id: 1,
    email: 'alice@example.com',
    name: 'Alice',
    created_at: '',
    settings: DEFAULT_SETTINGS,
  };
  const bob: UserRead = { ...alice, id: 2, email: 'bob@example.com', name: 'Bob' };
  const renewed = { access_token: 'alice-token-2', token_type: 'bearer', user: alice };
  const change = { current_password: 'old-secret', new_password: 'new-secret-1' };

  beforeEach(() => useAuthStore.getState().setSession('alice-token', alice));
  afterEach(() => useAuthStore.getState().clearSession());

  /** Change the password; `meanwhile` runs while the request is out. */
  async function changePassword(meanwhile = () => {}) {
    vi.spyOn(api, 'changePassword').mockImplementation(async () => {
      meanwhile();
      return renewed;
    });
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await act(() => result.current.mutateAsync(change));
  }

  /** Sign out everywhere; `meanwhile` runs while the request is out. */
  async function signOutEverywhere(meanwhile = () => {}) {
    vi.spyOn(api, 'signOutEverywhere').mockImplementation(async () => meanwhile());
    const { result } = renderHook(() => useSignOutEverywhere(), { wrapper });
    await act(() => result.current.mutateAsync());
  }

  it('carries on with the token a password change returns', async () => {
    await changePassword();
    expect(useAuthStore.getState()).toMatchObject({ token: 'alice-token-2', user: alice });
  });

  it('does not bring back a session that ended while the password changed', async () => {
    await changePassword(() => useAuthStore.getState().clearSession());
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('leaves alone another account signed in while the password changed', async () => {
    await changePassword(() => {
      useAuthStore.getState().clearSession();
      useAuthStore.getState().setSession('bob-token', bob);
    });
    expect(useAuthStore.getState()).toMatchObject({ token: 'bob-token', user: bob });
  });

  it('signs this browser out once every session has ended', async () => {
    await signOutEverywhere();
    expect(useAuthStore.getState()).toMatchObject({ token: null, user: null });
  });

  it('keeps a session begun while every session was ending', async () => {
    // Signed in again in another tab, which this one took over.
    await signOutEverywhere(() => useAuthStore.getState().setSession('alice-token-3', alice));
    expect(useAuthStore.getState().token).toBe('alice-token-3');
  });
});
