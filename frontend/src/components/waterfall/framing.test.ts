import { describe, expect, it } from 'vitest';

import { LEFT_CARD_REM, RIGHT_CARD_REM, insetFor } from '../workspace/chrome';
import { frameView } from './framing';

const LEFT = insetFor(LEFT_CARD_REM);
const RIGHT = insetFor(RIGHT_CARD_REM);

describe('frameView', () => {
  it('counts an expanded card with its margin and the gap to the surface', () => {
    expect(LEFT).toBe(12 + 24 * 16 + 12);
    expect(RIGHT).toBe(12 + 22 * 16 + 12);
  });

  it('leaves the picture centred while nothing is expanded', () => {
    expect(frameView(1440, 844)).toEqual({ zoom: 0.85, shift: 0 });
  });

  it('centres the surface in the room between whatever is expanded', () => {
    for (const inset of [
      { left: LEFT, right: 0 },
      { left: 0, right: RIGHT },
      { left: LEFT, right: RIGHT },
    ]) {
      const width = 1440;
      const { shift } = frameView(width, 844, inset);
      expect(width / 2 + shift).toBe((inset.left + (width - inset.right)) / 2);
    }
    expect(frameView(1440, 844, { left: LEFT, right: 0 }).shift).toBeGreaterThan(0);
    expect(frameView(1440, 844, { left: 0, right: RIGHT }).shift).toBeLessThan(0);
  });

  it('keeps the lens while there is room, and widens it when the cards leave little', () => {
    expect(frameView(1440, 844, { left: LEFT, right: 0 }).zoom).toBe(0.85);
    const free = 1280 - LEFT - RIGHT;
    expect(frameView(1280, 664, { left: LEFT, right: RIGHT }).zoom).toBeCloseTo(free / (1.2 * 664));
  });

  it('frames narrow and very wide panes within limits', () => {
    expect(frameView(375, 700).zoom).toBe(0.45);
    expect(frameView(900, 700).zoom).toBeCloseTo(900 / (1.8 * 700));
    expect(frameView(3000, 700).zoom).toBe(0.85);
  });
});
