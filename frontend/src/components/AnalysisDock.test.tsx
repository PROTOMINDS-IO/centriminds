import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecanterSeverity, PhysicsResults } from '../api/types';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import AnalysisDock from './AnalysisDock';
import { project, stubPhoneViewport } from './workspace/fixtures';

const severity = {
  zone: 'alarm',
  velocity_mm_s: 15.2,
  operating_rpm: 3000,
  sweep_max_mm_s: 15.2,
  sweep_max_rpm: 3000,
  sweep_max_zone: 'alarm',
  diameter_class: 'lt350',
  diameter_class_label: '< 350 mm',
  bowl_diameter_mm: null,
  good_below: 8,
  alarm_at: 14,
  shutdown_at: 18,
  fat_new: 5,
  fat_refurbished: 7,
  band_lo_hz: 10,
  band_hi_hz: 400,
  amplitude_scale: 'rms',
  trend_rpm: [1000, 3000],
  trend_mm_s: [4, 15.2],
} satisfies DecanterSeverity;

const physics: PhysicsResults = { peaks: [], severity, structural_modes: [] };

function renderDock(
  p: PhysicsResults | undefined,
  more: Partial<Parameters<typeof AnalysisDock>[0]> = {},
) {
  return render(
    <MemoryRouter>
      <AnalysisDock
        project={undefined}
        physics={p}
        isAnalyzing={false}
        analyzeError={null}
        onReanalyze={() => {}}
        onRename={async () => {}}
        {...more}
      />
    </MemoryRouter>,
  );
}

const card = () => screen.getByRole('region', { name: 'Measurement' });

describe('AnalysisDock', () => {
  beforeEach(() => useUIStore.setState({ analysisPanel: null, displayOpen: false }));
  afterEach(() => {
    vi.unstubAllGlobals();
    useSettingsStore.setState({ language: 'auto' });
  });

  it('shows the rating on the Condition tab while every section is collapsed', () => {
    renderDock(physics);
    const condition = screen.getByRole('tab', { name: 'Condition: 15.2\u00a0mm/s, Alarm' });
    expect(condition).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('expands a section inside the card, switches, and collapses on its tab again', () => {
    renderDock(physics);
    fireEvent.click(screen.getByRole('tab', { name: /^Condition:/ }));
    expect(within(card()).getByRole('tabpanel', { name: 'Condition' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Condition:/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    expect(within(card()).getByRole('tabpanel', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Condition' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('collapses with the close button and gives focus back to the tab', () => {
    renderDock(physics);
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));
    const close = screen.getByRole('button', { name: 'Close Sources' });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Sources' })).toHaveFocus();
  });

  it('collapses on Escape', () => {
    useUIStore.setState({ analysisPanel: 'sources' });
    renderDock(physics);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });

  it('leaves Escape inside a field to the field', () => {
    useUIStore.setState({ analysisPanel: 'sources' });
    renderDock(physics);
    const field = document.createElement('input');
    card().append(field);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.getByRole('tabpanel', { name: 'Sources' })).toBeInTheDocument();
    field.remove();
  });

  it('leaves Escape pressed in the view card to that card', () => {
    useUIStore.setState({ analysisPanel: 'sources' });
    renderDock(physics);
    const other = document.createElement('button');
    other.setAttribute('data-chrome', 'right');
    document.body.append(other);
    fireEvent.keyDown(other, { key: 'Escape' });
    expect(screen.getByRole('tabpanel', { name: 'Sources' })).toBeInTheDocument();
    other.remove();
  });

  it('leaves Escape pressed elsewhere on the page (e.g. a menu) alone', () => {
    useUIStore.setState({ analysisPanel: 'sources' });
    renderDock(physics);
    const menuItem = document.createElement('button');
    document.body.append(menuItem);
    fireEvent.keyDown(menuItem, { key: 'Escape' });
    expect(screen.getByRole('tabpanel', { name: 'Sources' })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('tabpanel')).toBeNull();
    menuItem.remove();
  });

  it('shows progress before the first rating', () => {
    renderDock(undefined, { isAnalyzing: true });
    expect(screen.getByRole('tab', { name: 'Condition: analysing…' })).toBeInTheDocument();
  });

  it('offers to re-run a failed analysis', () => {
    const onReanalyze = vi.fn();
    useUIStore.setState({ analysisPanel: 'condition' });
    renderDock(undefined, { analyzeError: new Error('boom'), onReanalyze });
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyse' }));
    expect(onReanalyze).toHaveBeenCalledOnce();
  });

  it('opens a section as a bottom sheet on phones, one sheet at a time', () => {
    stubPhoneViewport();
    useUIStore.setState({ displayOpen: true });
    renderDock(physics);
    fireEvent.click(screen.getByRole('tab', { name: 'Sources' }));

    const sheet = screen.getByRole('region', { name: 'Sources' });
    expect(within(sheet).getByRole('tabpanel', { name: 'Sources' })).toBeInTheDocument();
    expect(card()).not.toContainElement(sheet);
    expect(useUIStore.getState().displayOpen).toBe(false);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close Sources' }));
    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull();
  });

  it('speaks German', () => {
    useSettingsStore.setState({ language: 'de' });
    renderDock(physics, { project });
    expect(screen.getByRole('link', { name: 'Zurück zu den Projekten' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('tab', { name: 'Zustand: 15,2\u00a0mm/s, Alarm' })).toBeInTheDocument();
    expect(screen.getByText('Example decanter · 120–3.200 U/min · 0–400 Hz')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Quellen' }));
    expect(screen.getByRole('tabpanel', { name: 'Quellen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quellen schließen' })).toBeInTheDocument();
    expect(screen.getByText('Stärkste Peaks')).toBeInTheDocument();
  });
});
