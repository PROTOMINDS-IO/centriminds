import { describe, expect, it } from 'vitest';

import { niceTicks, ticksReaching } from './ticks';

describe('niceTicks', () => {
  it('returns round values inside the range', () => {
    expect(niceTicks(0, 400, 5)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(120, 3200, 5)).toEqual([1000, 2000, 3000]);
    expect(niceTicks(0, 72.06, 4)).toEqual([0, 20, 40, 60]);
  });

  it('does not drift with small steps', () => {
    expect(niceTicks(0, 0.6, 4)).toEqual([0, 0.2, 0.4, 0.6]);
  });
});

describe('ticksReaching', () => {
  it('always reaches the tallest value', () => {
    expect(ticksReaching(12, 3)).toEqual([0, 5, 10, 15]);
    expect(ticksReaching(9, 3)).toEqual([0, 5, 10]);
    expect(ticksReaching(4, 3)).toEqual([0, 2, 4]);
    for (const max of [0.1, 0.37, 1, 2.5, 7.3, 12, 18.2, 64, 99.9, 1234]) {
      const ticks = ticksReaching(max, 3);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });
});
