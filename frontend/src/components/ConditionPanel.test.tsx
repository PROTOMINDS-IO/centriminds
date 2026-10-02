import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PhysicsResults } from '../api/types';
import { useSettingsStore } from '../store/settingsStore';
import ConditionPanel from './ConditionPanel';
import FormError from './FormError';
import { physics as withMode, severity } from './workspace/fixtures';

const physics: PhysicsResults = { peaks: [], severity, structural_modes: [] };

describe('ConditionPanel', () => {
  afterEach(() => useSettingsStore.setState({ language: 'auto' }));

  it('shows the rating, its zone and the limits', () => {
    render(<ConditionPanel physics={physics} isAnalyzing={false} onEditMachine={() => {}} />);
    expect(screen.getByText('11.5')).toBeInTheDocument();
    expect(screen.getAllByText('Usable').length).toBeGreaterThan(0);
    expect(screen.getByText('Good below')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('At operating speed,', { exact: false })).toHaveTextContent(
      'At operating speed, 3,150 rpm',
    );
  });

  it('points to the machine section while the bowl diameter is unset', () => {
    const onEdit = vi.fn();
    render(<ConditionPanel physics={physics} isAnalyzing={false} onEditMachine={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set diameter' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('shows progress while there is no rating yet', () => {
    render(<ConditionPanel physics={undefined} isAnalyzing onEditMachine={() => {}} />);
    expect(screen.getByText('Analysing the measurement…')).toBeInTheDocument();
  });

  it('names the structural modes and their bowl crossing', () => {
    render(<ConditionPanel physics={withMode} isAnalyzing={false} onEditMachine={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Rigid-body mode, vertical' })).toBeInTheDocument();
    expect(screen.getByText('9.19 Hz')).toBeInTheDocument();
    expect(screen.getByText(/the Bowl 1× crosses it at/)).toHaveTextContent('551 rpm');
  });

  it('speaks German, with the German number format', () => {
    useSettingsStore.setState({ language: 'de' });
    render(<ConditionPanel physics={withMode} isAnalyzing={false} onEditMachine={() => {}} />);
    expect(screen.getByText('11,5')).toBeInTheDocument();
    expect(screen.getByText('mm/s Effektivwert (RMS)')).toBeInTheDocument();
    expect(screen.getAllByRole('term').map((el) => el.textContent)).toEqual([
      'Gut unter',
      'Alarm',
      'Abschaltung',
    ]);
    expect(screen.getByRole('button', { name: 'Durchmesser eingeben' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schwingung über Drehzahl' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Starrkörpermode, vertikal' })).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Gesamtschwinggeschwindigkeit über Drehzahl; Maximum 11,5\u00a0mm/s bei etwa 3.150\u00a0U/min',
    );
  });
});

describe('FormError', () => {
  it('shows the server message without the status prefix', () => {
    render(<FormError error={new Error('401 Unauthorized: Invalid email or password')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
