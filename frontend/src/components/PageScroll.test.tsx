import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { UserRead } from '../api/types';
import Dashboard from '../pages/Dashboard';
import Machines from '../pages/Machines';
import Settings from '../pages/Settings';
import Upload from '../pages/Upload';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import { escapedFromScrollArea } from '../test/scrollArea';
import Layout from './Layout';

const alice: UserRead = {
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
  created_at: '2026-01-01T00:00:00Z',
  settings: DEFAULT_SETTINGS,
};

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="settings" element={<Settings />} />
            <Route path="machines" element={<Machines />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useAuthStore.getState().setSession('alice-token', alice);
  vi.spyOn(api, 'listProjects').mockResolvedValue([]);
  vi.spyOn(api, 'profiles').mockResolvedValue([]);
  vi.spyOn(api, 'profileTemplates').mockResolvedValue([]);
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

describe('PageScroll', () => {
  // Each page has sr-only content (legends, link notes, the upload's file
  // input). Placed against the document rather than the page's scroll area,
  // it makes the document taller than the window, and scrolling past the end
  // of the page then moves the whole app off screen.
  it.each([
    ['/', 'Projects'],
    ['/upload', 'New analysis'],
    ['/settings', 'Settings'],
    ['/machines', 'Machines'],
  ])('keeps the sr-only content of %s inside the page’s scroll area', async (path, title) => {
    const { container } = renderAt(path);
    await screen.findByRole('heading', { level: 1, name: title });
    expect(container.querySelector('main .sr-only')).not.toBeNull();
    expect(escapedFromScrollArea(container)).toEqual([]);
  });
});
