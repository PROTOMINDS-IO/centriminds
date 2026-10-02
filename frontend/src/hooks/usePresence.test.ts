import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prefersReducedMotion } from '../lib/motion';
import { usePresence } from './usePresence';

// test/setup.ts runs every test under reduced motion; here motion is on
// unless a test says otherwise.
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(prefersReducedMotion).mockReturnValue(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(prefersReducedMotion).mockReturnValue(true);
});

describe('usePresence', () => {
  it('mounts at once, and unmounts only after the closing animation', () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, 200), {
      initialProps: { open: false },
    });
    expect(result.current).toEqual({ mounted: false, exiting: false });

    rerender({ open: true });
    expect(result.current).toEqual({ mounted: true, exiting: false });

    rerender({ open: false });
    expect(result.current).toEqual({ mounted: true, exiting: true });
    act(() => vi.advanceTimersByTime(199));
    expect(result.current.mounted).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual({ mounted: false, exiting: false });
  });

  it('closes at once under reduced motion', () => {
    vi.mocked(prefersReducedMotion).mockReturnValue(true);
    const { result, rerender } = renderHook(({ open }) => usePresence(open, 200), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    expect(result.current).toEqual({ mounted: false, exiting: false });
  });

  it('stays open when reopened while closing', () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open, 200), {
      initialProps: { open: true },
    });
    rerender({ open: false });
    rerender({ open: true });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current).toEqual({ mounted: true, exiting: false });
  });
});
