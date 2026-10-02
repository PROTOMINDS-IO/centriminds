import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUIStore } from '../../store/uiStore';
import { hoverAt, useHoverStore } from './hover';
import { buildModel } from './model';
import SlicePanel from './SlicePanel';
import { blocksAt } from './testData';

/** Bin of the highest point of the drawn spectrum. */
function drawnPeakBin() {
  const svg = screen.getByRole('img', { name: /^Spectrum at/ });
  const d = svg.querySelector('path')!.getAttribute('d')!;
  const ys = [...d.matchAll(/[ML][-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]));
  return ys.indexOf(Math.min(...ys)); // SVG y grows downwards
}

const peakBin = (values: number[]) => values.indexOf(Math.max(...values));

describe('SlicePanel', () => {
  beforeEach(() => useUIStore.setState({ showSlice: true }));
  afterEach(() => {
    useUIStore.setState({ showSlice: false });
    useHoverStore.getState().setHover(null);
  });

  // Three blocks at 1500 rpm each time: the speed alone cannot tell them apart.
  it.each([
    ['a constant-speed file', [1500, 1500, 1500], null],
    ['a sweep that returns to a speed', [1500, 2400, 1500, 600, 1500], null],
    ['the same sweep, speed-filtered', [1500, 2400, 1500, 600, 1500], { min: 1000, max: 2000 }],
  ])('shows the spectrum of the hovered row in %s', (_name, speeds, rpmFilter) => {
    const spec = blocksAt(speeds);
    const model = buildModel(spec, { scale: 'linear', height: 1, rpmFilter });
    render(<SlicePanel spectrogram={spec} />);

    for (let row = 0; row < model.nRows; row++) {
      act(() => useHoverStore.getState().setHover(hoverAt(model, { row, bin: 0 })));
      // The spectrum the surface draws at that row, not another at the same speed.
      expect(drawnPeakBin()).toBe(peakBin(model.rows[row]));
      const rpm = model.rpm[row].toLocaleString('en');
      expect(screen.getByText(`Spectrum at ${rpm} rpm`)).toBeInTheDocument();
    }
  });
});
