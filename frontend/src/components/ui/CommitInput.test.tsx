import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommitInput } from './CommitInput';

function renderField(value = '800') {
  const onCommit = vi.fn();
  render(<CommitInput aria-label="Bowl diameter" value={value} onCommit={onCommit} />);
  const input = screen.getByLabelText<HTMLInputElement>('Bowl diameter');
  act(() => input.focus());
  return { input, onCommit };
}

describe('CommitInput', () => {
  it('discards the edit on Escape', () => {
    const { input, onCommit } = renderField();
    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('800');
    expect(input).not.toHaveFocus();
  });

  it('saves on Enter', () => {
    const { input, onCommit } = renderField();
    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('1500');
  });

  it('saves when the field loses focus', () => {
    const { input, onCommit } = renderField();
    fireEvent.change(input, { target: { value: '1500' } });
    act(() => input.blur());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('1500');
  });

  it('does not save an unchanged value', () => {
    const { input, onCommit } = renderField();
    act(() => input.blur());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('saves the next edit after an Escape', () => {
    const { input, onCommit } = renderField();
    fireEvent.change(input, { target: { value: '1500' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    act(() => input.focus());
    fireEvent.change(input, { target: { value: '900' } });
    act(() => input.blur());
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('900');
  });
});
