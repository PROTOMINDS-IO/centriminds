import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import SourcesPanel from './SourcesPanel';
import { physics } from './workspace/fixtures';

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SourcesPanel physics={physics} projectId={1} />
    </QueryClientProvider>,
  );
}

describe('SourcesPanel', () => {
  beforeEach(() => vi.spyOn(api, 'listAnnotations').mockResolvedValue([]));
  afterEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState(DEFAULT_SETTINGS);
  });

  it('suggests resonance zones with the lines that swell there, to keep', async () => {
    const create = vi.spyOn(api, 'createAnnotation').mockResolvedValue({} as never);
    renderPanel();
    expect(screen.getByText('62.0–78.0 Hz')).toBeInTheDocument();
    expect(screen.getByText('100% likely · up to 2.20 mm/s')).toBeInTheDocument();
    expect(
      screen.getByText(/Swelling on Bowl 3× \(1,490 rpm\), Scroll 3× \(1,523 rpm\)/),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Keep as annotation' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(1, {
        annotation_type: 'band',
        freq_hz: 62,
        freq_hz_end: 78,
        label: 'Resonance zone',
        color: 'slot:0',
      }),
    );
  });

  it('names the mains among the speed-independent lines', () => {
    renderPanel();
    expect(screen.getByText('Electrical: Mains 1×')).toBeInTheDocument();
    expect(screen.getByText('50.00 Hz')).toBeInTheDocument();
  });

  it('speaks German', () => {
    useSettingsStore.setState({ language: 'de' });
    renderPanel();
    expect(screen.getByRole('heading', { name: 'Mögliche Resonanzbereiche' })).toBeInTheDocument();
    expect(screen.getByText('Elektrisch: Mains 1×')).toBeInTheDocument();
  });
});
