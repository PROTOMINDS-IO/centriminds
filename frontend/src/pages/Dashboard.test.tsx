import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api/client';
import type { ProjectSummary } from '../api/types';
import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import Dashboard from './Dashboard';

const HOUR = 3_600_000;

function project(over: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: 1,
    name: 'Decanter',
    created_at: new Date(Date.now() - 3 * HOUR).toISOString(),
    updated_at: '',
    machine_profile_id: null,
    machine_name: 'Example decanter',
    machine_parameters: {},
    notes_markdown: '',
    status: 'new',
    odx_filename: 'sweep.odx',
    odx_hash: '',
    n_blocks: 10,
    bin_count: 10,
    freq_min_hz: 0,
    freq_max_hz: 1000,
    freq_step_hz: 1,
    rpm_min: 120,
    rpm_max: 3200,
    odx_header_path: null,
    odx_export_human: null,
    odx_format_version: null,
    detected_profile_id: null,
    bowl_diameter_mm: null,
    severity_zone: null,
    severity_mm_s: null,
    ...over,
  };
}

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent);

beforeEach(() => {
  // Thumbnails load when scrolled into view; here they never are.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(api, 'listProjects').mockResolvedValue([
    project({ id: 1, name: 'Dekanter Nord', severity_zone: 'alarm', severity_mm_s: 15.24 }),
    project({ id: 2, name: 'Dekanter Süd', created_at: new Date(Date.now() - HOUR).toISOString() }),
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useSettingsStore.setState(DEFAULT_SETTINGS);
});

describe('Dashboard', () => {
  it('speaks German: header, filters, columns and rows', async () => {
    useSettingsStore.setState({ language: 'de' });
    renderDashboard();

    expect(
      await screen.findByText('2 Messungen · davon 1 mit Alarm oder schlechter'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Projekte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Neue Analyse' })).toHaveAttribute('href', '/upload');

    const search = screen.getByRole('textbox', { name: 'Projekte durchsuchen' });
    expect(search).toHaveAttribute('placeholder', 'Projekte, Dateien oder Pfade suchen');
    expect(optionTexts(screen.getByRole('combobox', { name: 'Nach Zustand filtern' }))).toEqual([
      'Alle Zustände',
      'Alarm oder schlechter',
      'Nicht analysiert',
    ]);
    expect(optionTexts(screen.getByRole('combobox', { name: 'Sortierung' }))).toEqual([
      'Neueste zuerst',
      'Höchste Schwingung',
      'Name (A–Z)',
    ]);
    for (const column of ['Spektrum', 'Projekt', 'Maschine', 'Zustand', 'Hinzugefügt']) {
      expect(screen.getByText(column)).toBeInTheDocument();
    }

    // Newest first: Süd (an hour ago), then Nord (three hours ago, rated).
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]).getByText('vor 1 Stunde')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Nicht analysiert')).toBeInTheDocument();
    expect(within(rows[1]).getByText('vor 3 Stunden')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Alarm')).toBeInTheDocument();
    // (getByText folds the no-break space before the unit into a plain one.)
    expect(within(rows[1]).getByText('15,2 mm/s')).toBeInTheDocument();
    expect(within(rows[1]).getByText('120–3.200 U/min')).toBeInTheDocument();
    expect(
      within(rows[1]).getByRole('button', { name: 'Dekanter Nord löschen' }),
    ).toBeInTheDocument();
  });

  it('filters and sorts', async () => {
    renderDashboard();
    await screen.findByText('2 measurements · 1 at alarm level or above');

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'severity' },
    });
    expect(screen.getAllByRole('link', { name: /^Dekanter/ }).map((l) => l.textContent)).toEqual([
      'Dekanter Nord',
      'Dekanter Süd',
    ]);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by condition' }), {
      target: { value: 'unrated' },
    });
    expect(screen.getAllByRole('link', { name: /^Dekanter/ }).map((l) => l.textContent)).toEqual([
      'Dekanter Süd',
    ]);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search projects' }), {
      target: { value: 'nord' },
    });
    expect(screen.getByText('No projects match those filters.')).toBeInTheDocument();
  });
});
