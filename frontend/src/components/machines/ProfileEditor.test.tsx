import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, api } from '../../api/client';
import type { MachineProfileRead, ProfileCheck } from '../../api/types';
import { DEFAULT_SETTINGS, useSettingsStore } from '../../store/settingsStore';
import { genericProfile, profile } from '../workspace/fixtures';
import ProfileEditor from './ProfileEditor';

const withPoint: MachineProfileRead = {
  ...profile,
  data: {
    ...profile.data,
    operating_points: [
      {
        label: '3000 rpm',
        bowl_rpm: 3000,
        parameters: {},
        reference_rpm: { scroll: 3008, bowl: 2990 },
      },
    ],
  },
};

const check: ProfileCheck = {
  problems: [],
  points: [
    {
      label: '3000 rpm',
      bowl_rpm: 3000,
      components: [
        {
          key: 'bowl',
          speed_rpm: 3000,
          freq_hz: 50,
          reference_rpm: 2990,
          delta_rpm: 10,
          error: null,
        },
        {
          key: 'scroll',
          speed_rpm: 3008,
          freq_hz: 50.13,
          reference_rpm: 3008,
          delta_rpm: 0,
          error: null,
        },
        {
          key: 'mains',
          speed_rpm: 3000,
          freq_hz: 50,
          reference_rpm: null,
          delta_rpm: null,
          error: null,
        },
      ],
    },
  ],
};

function renderEditor(p: MachineProfileRead) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProfileEditor profile={p} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfileEditor', () => {
  beforeEach(() => vi.spyOn(api, 'checkProfile').mockResolvedValue(check));
  afterEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState(DEFAULT_SETTINGS);
  });

  it('checks the formulas against the sheet at each operating point', async () => {
    renderEditor(withPoint);
    await waitFor(() => expect(api.checkProfile).toHaveBeenCalledWith(withPoint.data));
    expect(await screen.findByText('differs by 10.0 rpm')).toBeInTheDocument();
    expect(screen.getByText('matches the sheet')).toBeInTheDocument();
    expect(screen.getByText('3,008 rpm')).toBeInTheDocument();
  });

  it('saves the edited document as a whole', async () => {
    const saved = vi.spyOn(api, 'replaceProfile').mockResolvedValue(profile);
    renderEditor(profile);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    const formula = screen.getByLabelText('Speed formula of Scroll');
    fireEvent.change(formula, { target: { value: 'n - d' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const [id, data] = saved.mock.calls[0];
    expect(id).toBe(7);
    expect(data.components[1].speed_rpm).toBe('n - d');

    fireEvent.click(screen.getByRole('button', { name: 'Add component' }));
    const keys = screen
      .getAllByLabelText('Name in formulas')
      .map((i) => (i as HTMLInputElement).value);
    expect(keys).toContain('c');
  });

  it('lists what keeps a draft from saving, by the formula it concerns', async () => {
    vi.spyOn(api, 'checkProfile').mockResolvedValue({
      points: [],
      problems: [{ loc: 'components.1.speed_rpm', msg: 'unknown name dd' }],
    });
    renderEditor(profile);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The profile cannot be saved yet: 1 problem');
    const formula = screen.getByLabelText('Speed formula of Scroll');
    expect(formula).toHaveAttribute('aria-invalid', 'true');
    expect(within(formula.closest('td')!).getByText(/unknown name dd/)).toBeInTheDocument();
  });

  it('keeps built-in profiles read-only', () => {
    renderEditor(genericProfile);
    expect(
      screen.getByText('Built in and read-only. Duplicate it to make your own.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByLabelText('Speed formula of Scroll')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
  });

  it('speaks German', async () => {
    useSettingsStore.setState({ language: 'de' });
    renderEditor(withPoint);
    expect(screen.getByRole('heading', { name: 'Komponenten' })).toBeInTheDocument();
    expect(await screen.findByText('weicht um 10,0 U/min ab')).toBeInTheDocument();
  });
});

describe('ProfileEditor saving', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows where a save was refused', async () => {
    vi.spyOn(api, 'checkProfile').mockResolvedValue(check);
    vi.spyOn(api, 'replaceProfile').mockImplementation(async () => {
      throw new ApiError(422, 'invalid', {
        code: 'invalid_profile',
        params: { errors: [{ loc: 'data.name', msg: 'String should have at least 1 character' }] },
      });
    });
    renderEditor(profile);
    fireEvent.change(screen.getByLabelText('Speed formula of Scroll'), { target: { value: 'n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'name: String should have at least 1 character',
    );
  });
});
