import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '../api/client';
import type { UserRead } from '../api/types';
import RequireAuth from '../components/RequireAuth';
import { prefersReducedMotion } from '../lib/motion';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import Settings from './Settings';

const alice: UserRead = {
  id: 1,
  email: 'alice@example.com',
  name: 'Alice',
  created_at: '2026-01-01T00:00:00Z',
  settings: DEFAULT_SETTINGS,
};

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The page as the app shows it: behind RequireAuth, which checks the token
 *  (GET /me) before it lets the page in, with the app's own query cache. */
function renderSignedIn() {
  vi.spyOn(api, 'me').mockResolvedValue(alice);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/login" element={<p>Sign-in page</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The password form, filled in and sent. */
function changePassword(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

beforeEach(() => {
  useAuthStore.getState().setSession('alice-token', alice);
  // The account echoes what it was sent.
  vi.spyOn(api, 'updateMe').mockImplementation(async ({ name, settings }) => ({
    ...alice,
    name: name ?? alice.name,
    settings: { ...alice.settings, ...settings },
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.getState().clearSession();
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

describe('Settings: appearance and language', () => {
  it('applies a theme at once and saves it to the account', () => {
    renderSettings();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAccessibleDescription(
      'Follows your device',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(useSettingsStore.getState().theme).toBe('light');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(api.updateMe).toHaveBeenCalledWith({ settings: { theme: 'light' } });

    fireEvent.click(screen.getByRole('radio', { name: 'System' }));
    expect(useSettingsStore.getState().theme).toBe('system');
  });

  it('switches the language, and the page follows', () => {
    useSettingsStore.setState({ language: 'en' });
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE', 'de']);
    renderSettings();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Automatic (Deutsch)' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));

    expect(useSettingsStore.getState().language).toBe('de');
    expect(api.updateMe).toHaveBeenCalledWith({ settings: { language: 'de' } });
    expect(screen.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Darstellung' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Automatisch (Deutsch)' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hell' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passwort ändern' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sitzungen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Überall abmelden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück zu den Projekten' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});

describe('Settings: 3D view', () => {
  // A device that does not ask for reduced motion: auto-rotate defaults on.
  beforeEach(() => vi.mocked(prefersReducedMotion).mockReturnValue(false));
  afterEach(() => vi.mocked(prefersReducedMotion).mockReturnValue(true));

  it('turns idle auto-rotate off and sets the default view and scale', () => {
    renderSettings();
    const rotate = screen.getByRole('switch', { name: 'Auto-rotate when idle' });
    expect(rotate).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(rotate);
    expect(useSettingsStore.getState().auto_rotate).toBe(false);
    expect(rotate).toHaveAttribute('aria-checked', 'false');
    expect(api.updateMe).toHaveBeenCalledWith({ settings: { auto_rotate: false } });

    fireEvent.click(screen.getByRole('button', { name: 'Top view' }));
    expect(useSettingsStore.getState().default_view).toBe('top');
    expect(screen.getByRole('button', { name: 'Top view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(useSettingsStore.getState().default_scale).toBe('log');
  });
});

describe('Settings: profile', () => {
  it('saves a new name to the account and the session', async () => {
    renderSettings();
    const name = screen.getByLabelText('Name');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(name).toHaveValue('Alice');
    expect(save).toBeDisabled();
    expect(screen.getByLabelText('Email')).toHaveValue('alice@example.com');

    fireEvent.change(name, { target: { value: '  Alice Smith ' } });
    fireEvent.click(save);

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(api.updateMe).toHaveBeenCalledWith({ name: 'Alice Smith' });
    expect(useAuthStore.getState().user?.name).toBe('Alice Smith');
    expect(name).toHaveValue('Alice Smith');
    expect(save).toBeDisabled();
  });
});

describe('Settings: password', () => {
  it('checks the new password before sending it', () => {
    const send = vi.spyOn(api, 'changePassword');
    renderSettings();
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    const next = screen.getByLabelText('New password');
    const confirm = screen.getByLabelText('Confirm new password');
    expect(next).toHaveAccessibleDescription('At least 8 characters');

    changePassword('old-secret', 'short');
    expect(next).toHaveAccessibleDescription('The password needs at least 8 characters.');
    expect(next).toHaveAttribute('aria-invalid', 'true');
    expect(next).toHaveFocus();

    // bcrypt's limit is 72 bytes: 40 "ä" are 80.
    changePassword('old-secret', 'ä'.repeat(40));
    expect(next).toHaveAccessibleDescription(/too long: at most 72 characters/);

    changePassword('old-secret', 'new-secret-1', 'new-secret-2');
    expect(confirm).toHaveAccessibleDescription('The passwords do not match.');
    expect(confirm).toHaveFocus();

    expect(send).not.toHaveBeenCalled();
  });

  it('changes the password, and stays signed in here with the new token', async () => {
    const send = vi.spyOn(api, 'changePassword').mockResolvedValue({
      access_token: 'alice-token-2',
      token_type: 'bearer',
      user: alice,
    });
    renderSignedIn();
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    changePassword('old-secret', 'new-secret-1');

    expect(
      await screen.findByText(
        'Your password has been changed. You are now signed out on your other devices.',
      ),
    ).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith({
      current_password: 'old-secret',
      new_password: 'new-secret-1',
    });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(screen.getByLabelText('New password')).toHaveValue('');
    // The server ended the old token; this browser carries on with the new
    // one, which RequireAuth takes without another check (that would put the
    // loading screen in place of the page, and lose the message above).
    expect(useAuthStore.getState().token).toBe('alice-token-2');
    expect(api.me).toHaveBeenCalledOnce();
  });

  it('explains a wrong current password, in the chosen language', async () => {
    vi.spyOn(api, 'changePassword').mockRejectedValue(
      new ApiError(400, '400 Bad Request: Current password is incorrect', {
        code: 'wrong_password',
        detail: 'Current password is incorrect',
      }),
    );
    useSettingsStore.setState({ language: 'de' });
    renderSettings();
    fireEvent.change(screen.getByLabelText('Aktuelles Passwort'), { target: { value: 'nope' } });
    fireEvent.change(screen.getByLabelText('Neues Passwort'), {
      target: { value: 'new-secret-1' },
    });
    fireEvent.change(screen.getByLabelText('Neues Passwort bestätigen'), {
      target: { value: 'new-secret-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Passwort ändern' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Das aktuelle Passwort ist falsch.');
    expect(screen.queryByText(/Ihr Passwort wurde geändert/)).toBeNull();
    expect(useAuthStore.getState().token).toBe('alice-token');
    // Nothing is lost: correct the field and send again.
    expect(screen.getByLabelText('Neues Passwort')).toHaveValue('new-secret-1');
  });
});

describe('Settings: sessions', () => {
  it('signs out everywhere, this browser included', async () => {
    const end = vi.spyOn(api, 'signOutEverywhere').mockResolvedValue(undefined);
    queryClient.setQueryData(['projects'], [{ id: 1, name: 'Alice’s decanter' }]);
    renderSignedIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));

    expect(await screen.findByText('Sign-in page')).toBeInTheDocument();
    expect(end).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().token).toBeNull();
    // Nothing of the account's is left (RequireAuth's idle query for no token
    // holds no data).
    const kept = queryClient.getQueryCache().findAll({ predicate: (q) => q.state.data != null });
    expect(kept).toEqual([]);
  });

  it('stays signed in when that fails, and says why', async () => {
    vi.spyOn(api, 'signOutEverywhere').mockRejectedValue(
      new ApiError(0, 'Network error — check your connection.', { code: 'network' }),
    );
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Network error — check your connection.',
    );
    expect(useAuthStore.getState().token).toBe('alice-token');
    expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeEnabled();
  });
});
