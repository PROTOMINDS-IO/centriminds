import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import MachineInfoCard from './MachineInfoCard';
import { project } from './workspace/fixtures';

const mutate = vi.fn();
vi.mock('../hooks/queries', async () => {
  const f = await import('./workspace/fixtures');
  return {
    useUpdateProject: () => ({ mutate, error: null }),
    useProfiles: () => ({ data: [f.genericProfile, f.profile] }),
  };
});

describe('MachineInfoCard', () => {
  it('keeps both of two parameter values saved before the project refetches', () => {
    render(
      <MemoryRouter>
        <MachineInfoCard project={project} />
      </MemoryRouter>,
    );
    const d = screen.getByLabelText('Differential speed (rpm)');
    fireEvent.change(d, { target: { value: '9.3' } });
    fireEvent.blur(d);
    const mains = screen.getByLabelText('Mains frequency (Hz)');
    fireEvent.change(mains, { target: { value: '60' } });
    fireEvent.blur(mains);
    // The project prop still has no overrides: the second save builds on the first.
    expect(mutate).toHaveBeenLastCalledWith({
      id: 1,
      body: { machine_parameters: { d: 9.3, f_mains: 60 } },
    });
  });
});
