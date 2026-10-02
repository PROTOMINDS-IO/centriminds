import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from '../../pages/Workspace';
import { DEFAULT_SETTINGS, useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';

// Server data from fixtures; the WebGL canvas cannot run in jsdom.
vi.mock('../../hooks/queries', async () => {
  const f = await import('./fixtures');
  const mutation = { mutate: () => {}, mutateAsync: async () => {}, isPending: false, error: null };
  return {
    useProject: () => ({ data: f.project, error: null }),
    useSpectrogramPreview: () => ({ data: f.spectrogram, isLoading: false, error: null }),
    useLatestPhysics: () => ({
      data: { results: f.physics, params: { inputs_hash: f.project.analysis_inputs_hash } },
      isSuccess: true,
      isLoading: false,
    }),
    useAnalyzeProject: () => mutation,
    useUpdateProject: () => mutation,
    useProfiles: () => ({ data: [f.genericProfile, f.profile] }),
    useAnnotations: () => ({ data: [], isLoading: false, error: null }),
    useSaveAnnotation: () => mutation,
    useDeleteAnnotation: () => mutation,
  };
});
vi.mock('../waterfall/Waterfall3D', () => ({ default: () => null }));

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/projects/1']}>
      <Routes>
        <Route path="/projects/:id" element={<Workspace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Workspace', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'de', default_view: 'top', default_scale: 'log' });
    // Left over from another project.
    useUIStore.setState({ analysisPanel: 'sources', displayOpen: true, viewMode: '3d' });
  });
  afterEach(() => useSettingsStore.setState(DEFAULT_SETTINGS));

  it('opens with the user’s view defaults and nothing expanded', () => {
    renderWorkspace();
    expect(useUIStore.getState()).toMatchObject({
      viewMode: 'top',
      ampScaleMode: 'log',
      analysisPanel: null,
      displayOpen: false,
    });
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('shows the whole chrome in German', () => {
    renderWorkspace();

    const measurement = screen.getByRole('region', { name: 'Messung' });
    expect(
      within(measurement).getByRole('link', { name: 'Zurück zu den Projekten' }),
    ).toHaveAttribute('href', '/');
    expect(within(measurement).getByRole('heading', { level: 1 })).toHaveTextContent('Demo sweep');
    expect(
      within(measurement).getByText('Example decanter · 120–3.200 U/min · 0–400 Hz'),
    ).toBeInTheDocument();
    expect(within(measurement).getByRole('tablist', { name: 'Analyse' })).toBeInTheDocument();
    for (const name of ['Zustand: 11,5\u00a0mm/s, Zulässig', 'Quellen', 'Maschine']) {
      expect(within(measurement).getByRole('tab', { name })).toBeInTheDocument();
    }

    const view = screen.getByRole('region', { name: 'Ansicht' });
    expect(within(view).getByRole('button', { name: 'Draufsicht' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of [
      'Spektrum bei einer Drehzahl',
      'Automatisch drehen, wenn unbenutzt',
      'Ansicht zurücksetzen',
      'Darstellung',
    ]) {
      expect(within(view).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/^Ziehen zum Verschieben · Scrollen zum Zoomen/)).toBeInTheDocument();

    fireEvent.click(within(view).getByRole('button', { name: 'Darstellung' }));
    expect(within(view).getByRole('tab', { name: 'Oberfläche' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(view).getByRole('button', { name: 'Log' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(view).getByRole('tab', { name: 'Einblendungen' }));
    expect(within(view).getByRole('switch', { name: 'Strukturmoden' })).toBeInTheDocument();
    expect(within(view).getByRole('switch', { name: /^Ordnungslinien/ })).toBeInTheDocument();

    fireEvent.click(within(measurement).getByRole('tab', { name: 'Maschine' }));
    expect(within(measurement).getByLabelText('Trommeldurchmesser')).toHaveAttribute(
      'placeholder',
      'Nicht gesetzt',
    );
    expect(within(measurement).getByLabelText('Maschinenprofil')).toHaveDisplayValue(
      'Example decanter',
    );
    // The per-run parameters, each showing the profile's value.
    expect(within(measurement).getByLabelText('Differential speed (rpm)')).toHaveAttribute(
      'placeholder',
      '8',
    );
    expect(within(measurement).getByRole('option', { name: 'Vertikal' })).toBeInTheDocument();
  });

  it('jumps from the rating to the bowl diameter', async () => {
    renderWorkspace();
    fireEvent.click(screen.getByRole('tab', { name: /^Zustand/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Durchmesser eingeben' }));
    expect(screen.getByRole('tabpanel', { name: 'Maschine' })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText('Trommeldurchmesser')).toHaveFocus());
  });
});
