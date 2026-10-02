import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../api/client';
import type { AnnotationRead } from '../../api/types';
import { useUIStore } from '../../store/uiStore';
import { physics } from '../workspace/fixtures';
import AnnotationsTab from './AnnotationsTab';

const zone: AnnotationRead = {
  id: 3,
  project_id: 1,
  annotation_type: 'band',
  freq_hz: 62,
  freq_hz_end: 78,
  rpm: null,
  rpm_end: null,
  amplitude: null,
  label: 'Possible resonance',
  color: 'slot:1',
  author: 'user',
  confidence: 1,
  status: 'active',
  created_at: '2026-10-01T10:00:00Z',
  payload: {},
};

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnotationsTab projectId={1} physics={physics} />
    </QueryClientProvider>,
  );
}

describe('AnnotationsTab', () => {
  beforeEach(() => {
    useUIStore.getState().resetForProject();
    vi.spyOn(api, 'listAnnotations').mockResolvedValue([zone]);
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists the saved annotations and removes one', async () => {
    const del = vi.spyOn(api, 'deleteAnnotation').mockResolvedValue({ deleted: 1 });
    renderTab();
    // The page's no-break space reads as a space.
    const name = 'Possible resonance · 62.0–78.0 Hz';
    expect(await screen.findByText(name)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: `Remove ${name.replace(' Hz', '\u00a0Hz')}` }),
    );
    await waitFor(() => expect(del).toHaveBeenCalledWith(1, 3));
  });

  it('adds a note at a point picked on the surface', async () => {
    const create = vi.spyOn(api, 'createAnnotation').mockResolvedValue({ ...zone, id: 4 });
    renderTab();
    // Once the one saved annotation is listed, a new one takes the next colour.
    await screen.findByText('Possible resonance · 62.0–78.0 Hz');
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'note' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Pick on the view' }));
    expect(useUIStore.getState().picking).toBe(true);
    // What the 3D view does on a click while picking.
    useUIStore.getState().setPicked({ freqHz: 50.04, rpm: 1499.6 });
    await waitFor(() => expect(screen.getByLabelText('Frequency (Hz)')).toHaveValue(50.04));
    expect(screen.getByLabelText('Speed (rpm)')).toHaveValue(1500);
    expect(useUIStore.getState().picked).toBeNull();

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Mains, not the bowl' } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(1, {
        annotation_type: 'note',
        freq_hz: 50.04,
        rpm: 1500,
        text: 'Mains, not the bowl',
        label: '',
        color: 'slot:1',
      }),
    );
  });

  it('pins an order line to one of the machine components', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Add annotation' }));
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'order_line' } });
    const of = screen.getByLabelText('Of');
    // The mechanical components only, after the measured speed.
    expect([...of.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Measured speed',
      'Bowl',
      'Scroll',
    ]);
    expect(screen.queryByRole('button', { name: 'Pick on the view' })).toBeNull();
  });
});
