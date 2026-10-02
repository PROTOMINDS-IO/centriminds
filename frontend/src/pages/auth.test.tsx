import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { UserRead, UserSettings } from '../api/types';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import Login from './Login';
import Register from './Register';

// three.js needs WebGL, which jsdom does not have; the backdrop is decoration.
vi.mock('../components/IsoBackground', () => ({ default: () => null }));

const user = (settings: Partial<UserSettings> = {}): UserRead => ({
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
  created_at: '2026-01-01T00:00:00Z',
  settings: { ...DEFAULT_SETTINGS, ...settings },
});

function renderAt(path: '/login' | '/register') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<p>Project list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function signIn(
  email: string,
  password: string,
  labels = { email: 'Email', password: 'Password' },
) {
  fireEvent.change(screen.getByLabelText(labels.email), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(labels.password), { target: { value: password } });
}

beforeEach(() => {
  vi.spyOn(api, 'authConfig').mockResolvedValue({ allow_registration: true });
  vi.spyOn(api, 'updateMe').mockResolvedValue(user());
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

describe('sign-in', () => {
  it('lets you pick the language and theme first, and keeps them for the account', async () => {
    vi.spyOn(api, 'login').mockResolvedValue({
      access_token: 'alice-token',
      token_type: 'bearer',
      user: user({ theme: 'dark', default_view: 'top' }),
    });
    renderAt('/login');

    fireEvent.click(screen.getByRole('button', { name: 'Deutsch' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hell' }));
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deutsch' })).toHaveAttribute('aria-pressed', 'true');
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(api.updateMe).not.toHaveBeenCalled();

    signIn('alice@example.com', 'secret-123', { email: 'E-Mail-Adresse', password: 'Passwort' });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));

    expect(await screen.findByText('Project list')).toBeInTheDocument();
    const settings = useSettingsStore.getState();
    expect([settings.language, settings.theme]).toEqual(['de', 'light']);
    expect(settings.default_view).toBe('top'); // the rest is the account's
    expect(api.updateMe).toHaveBeenCalledWith({ settings: { language: 'de', theme: 'light' } });
    // Signed in without a second round trip to verify the new token.
    expect(queryClient.getQueryData(['me', 'alice-token'])).toMatchObject({ id: 1 });
  });

  it('takes the account’s settings when nothing was picked', async () => {
    useSettingsStore.setState({ theme: 'light' });
    vi.spyOn(api, 'login').mockResolvedValue({
      access_token: 'alice-token',
      token_type: 'bearer',
      user: user({ theme: 'dark', language: 'de' }),
    });
    renderAt('/login');
    signIn('alice@example.com', 'secret-123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Project list')).toBeInTheDocument();
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(useSettingsStore.getState().language).toBe('de');
    expect(api.updateMe).not.toHaveBeenCalled();
  });
});

describe('sign-up', () => {
  it('checks the password in the chosen language before sending', () => {
    const register = vi.spyOn(api, 'register');
    useSettingsStore.setState({ language: 'de' });
    renderAt('/register');
    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'secret-123' } });
    fireEvent.change(screen.getByLabelText('Passwort bestätigen'), {
      target: { value: 'secret-124' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Konto erstellen' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Die Passwörter stimmen nicht überein.');
    expect(register).not.toHaveBeenCalled();
  });

  it('gives a new account the settings this browser already uses', async () => {
    useSettingsStore.setState({ theme: 'light', language: 'de' });
    vi.spyOn(api, 'register').mockResolvedValue({
      access_token: 'alice-token',
      token_type: 'bearer',
      user: user(),
    });
    renderAt('/register');
    fireEvent.change(screen.getByLabelText('E-Mail-Adresse'), {
      target: { value: 'alice@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'secret-123' } });
    fireEvent.change(screen.getByLabelText('Passwort bestätigen'), {
      target: { value: 'secret-123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Konto erstellen' }));

    expect(await screen.findByText('Project list')).toBeInTheDocument();
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(useSettingsStore.getState().language).toBe('de');
    expect(api.updateMe).toHaveBeenCalledWith({
      settings: { ...DEFAULT_SETTINGS, theme: 'light', language: 'de' },
    });
  });
});
