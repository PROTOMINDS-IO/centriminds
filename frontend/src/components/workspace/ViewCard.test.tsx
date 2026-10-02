import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../api/client';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { physics, stubPhoneViewport } from './fixtures';
import ViewCard from './ViewCard';

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ViewCard
        projectId={1}
        physics={physics}
        rpmMin={120}
        rpmMax={3200}
        freqMin={0}
        freqMax={400}
      />
    </QueryClientProvider>,
  );
}

const card = () => screen.getByRole('region', { name: 'View' });

describe('ViewCard', () => {
  beforeEach(() =>
    useUIStore.setState({
      displayOpen: false,
      displayTab: 'surface',
      analysisPanel: null,
      viewMode: '3d',
      showSlice: false,
    }),
  );
  beforeEach(() => vi.spyOn(api, 'listAnnotations').mockResolvedValue([]));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useSettingsStore.setState({ auto_rotate: null });
  });

  it('keeps every view control in one toolbar row', () => {
    renderCard();
    for (const name of [
      '3D',
      'Top',
      'Spectrum at one speed',
      'Reset view',
      'Save image',
      'Display',
    ]) {
      expect(within(card()).getByRole('button', { name })).toBeInTheDocument();
    }
    fireEvent.click(within(card()).getByRole('button', { name: 'Top' }));
    expect(useUIStore.getState().viewMode).toBe('top');

    const slice = within(card()).getByRole('button', { name: 'Spectrum at one speed' });
    fireEvent.click(slice);
    expect(slice).toHaveAttribute('aria-pressed', 'true');

    const rotate = within(card()).getByRole('button', { name: 'Auto-rotate when idle' });
    const wasOn = rotate.getAttribute('aria-pressed') === 'true';
    fireEvent.click(rotate);
    expect(useSettingsStore.getState().auto_rotate).toBe(!wasOn);
  });

  it('expands the display settings inside the card, as tabs', async () => {
    renderCard();
    const display = screen.getByRole('button', { name: 'Display' });
    expect(display).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(display);
    expect(display).toHaveAttribute('aria-expanded', 'true');
    expect(within(card()).getByRole('tabpanel', { name: 'Surface' })).toHaveTextContent('Scale');

    fireEvent.click(within(card()).getByRole('tab', { name: 'Overlays' }));
    expect(within(card()).getByRole('switch', { name: 'Structural modes' })).toBeChecked();
    expect(within(card()).getByRole('switch', { name: /^Order lines/ })).toBeChecked();
    // The machine's components can be hidden; the mains is not one of them.
    const shown = within(card()).getByRole('group', { name: 'Components shown' });
    expect(
      within(shown)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Bowl', 'Scroll']);

    fireEvent.click(within(card()).getByRole('tab', { name: 'Annotations' }));
    expect(await within(card()).findByText('No annotations yet.')).toBeInTheDocument();

    fireEvent.click(display);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('collapses on Escape and with its close button, giving focus back to Display', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Display' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUIStore.getState().displayOpen).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Display' }));
    const close = screen.getByRole('button', { name: 'Close Display' });
    close.focus();
    fireEvent.click(close);
    expect(useUIStore.getState().displayOpen).toBe(false);
    expect(screen.getByRole('button', { name: 'Display' })).toHaveFocus();
  });

  it('is a single View button on phones, whose sheet holds everything', () => {
    stubPhoneViewport();
    useUIStore.setState({ analysisPanel: 'condition' });
    renderCard();
    expect(screen.queryByRole('button', { name: 'Display' })).toBeNull();

    const viewCard = card();
    fireEvent.click(within(viewCard).getByRole('button', { name: 'View' }));
    // Phones show one sheet at a time.
    expect(useUIStore.getState().analysisPanel).toBeNull();

    const sheet = screen.getByRole('heading', { name: 'View' }).closest('section')!;
    expect(viewCard).not.toContainElement(sheet);
    expect(
      within(sheet).getByRole('switch', { name: 'Spectrum at one speed' }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
    expect(within(sheet).getByRole('tab', { name: 'Annotations' })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close View' }));
    expect(useUIStore.getState().displayOpen).toBe(false);
  });
});
