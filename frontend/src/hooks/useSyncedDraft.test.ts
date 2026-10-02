import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSyncedDraft } from './useSyncedDraft';

describe('useSyncedDraft', () => {
  it('keeps edits until the source value changes', () => {
    const { result, rerender } = renderHook(({ v }) => useSyncedDraft(v), {
      initialProps: { v: 5 },
    });
    expect(result.current[0]).toBe('5');
    act(() => result.current[1]('7'));
    rerender({ v: 5 });
    expect(result.current[0]).toBe('7');
    rerender({ v: 9 });
    expect(result.current[0]).toBe('9');
  });
});
