import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, useSettingsStore } from '../store/settingsStore';
import { escapedFromScrollArea } from '../test/scrollArea';
import ColormapPicker from './ColormapPicker';

afterEach(() => useSettingsStore.setState({ ...DEFAULT_SETTINGS }));

describe('ColormapPicker', () => {
  it.each([
    ['cards', false],
    ['swatches', true],
  ])('offers every scheme and saves the choice (%s)', (_name, compact) => {
    render(<ColormapPicker label="Surface colours" compact={compact} />);
    const group = screen.getByRole('group', { name: 'Surface colours' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByRole('radio', { name: 'Viridis' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }));
    expect(useSettingsStore.getState().colormap).toBe('ocean');
    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked();
  });

  // In the workspace the swatches sit in a card or sheet whose panel scrolls.
  it('keeps the swatches’ radios inside a scrolling panel', () => {
    const { container } = render(
      <div className="overflow-y-auto">
        <ColormapPicker label="Surface colours" compact />
      </div>,
    );
    expect(escapedFromScrollArea(container)).toEqual([]);
  });

  it('names the schemes in German', () => {
    useSettingsStore.setState({ language: 'de' });
    render(<ColormapPicker label="Oberflächenfarben" />);
    expect(screen.getByRole('radio', { name: 'Petrol' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Graphit' })).toBeInTheDocument();
  });
});
