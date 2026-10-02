import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { UserRead } from '../api/types';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import Layout from './Layout';

const alice: UserRead = {
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
  created_at: '',
  settings: DEFAULT_SETTINGS,
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Sign-in page</p>} />
        <Route element={<Layout />}>
          <Route index element={<p>Project list</p>} />
          <Route path="upload" element={<p>Upload page</p>} />
          <Route path="settings" element={<h1>Settings page</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const menuButton = () => screen.getByRole('button', { name: /Alice/ });

describe('Layout', () => {
  beforeEach(() => {
    useAuthStore.getState().setSession('alice-token', alice);
    // Cached data of this account, which signing out must drop.
    queryClient.setQueryData(['projects'], [{ id: 1, name: 'Alice’s decanter' }]);
  });
  afterEach(() => {
    useAuthStore.getState().clearSession();
    useSettingsStore.setState(DEFAULT_SETTINGS);
  });

  it('signs out to the login page and forgets everything cached', () => {
    renderAt('/');
    fireEvent.click(menuButton());
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(screen.getByText('Sign-in page')).toBeInTheDocument();
    expect(useAuthStore.getState().token).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('opens Settings from the account menu', () => {
    renderAt('/');
    const button = menuButton();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

    expect(screen.getByRole('heading', { name: 'Settings page' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('closes the menu on Escape and hands focus back to its button', () => {
    renderAt('/');
    fireEvent.click(menuButton());
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveFocus();
  });

  it('keeps the top bar to the logo and the account menu', () => {
    renderAt('/upload');
    const bar = screen.getByRole('banner');
    expect(within(bar).getAllByRole('link')).toHaveLength(1);
    expect(within(bar).getByRole('link', { name: 'CentriMinds home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(bar).queryByRole('link', { name: /projects/i })).toBeNull();
  });

  it('speaks German when chosen', () => {
    useSettingsStore.setState({ language: 'de' });
    renderAt('/');
    fireEvent.click(screen.getByRole('button', { name: 'Kontomenü für Alice' }));
    expect(screen.getByRole('link', { name: 'Einstellungen' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Impressum' })).toBeInTheDocument();
  });
});
