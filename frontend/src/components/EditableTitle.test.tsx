import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import EditableTitle from './EditableTitle';

/** Open the field, type a new name and press Enter (the save settles). */
async function renameTo(next: string) {
  fireEvent.click(screen.getByRole('button'));
  const input = screen.getByRole<HTMLInputElement>('textbox');
  fireEvent.change(input, { target: { value: next } });
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  return input;
}

describe('EditableTitle', () => {
  it('saves the new name and closes the field', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<EditableTitle value="Run 1" onCommit={onCommit} />);
    await renameTo('Run 2');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('Run 2');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps the field open and says why when saving fails', async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error('Network down'));
    render(<EditableTitle value="Run 1" onCommit={onCommit} />);
    const input = await renameTo('Run 2');

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(input).toHaveValue('Run 2');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Typing clears the message; Escape gives up the edit.
    fireEvent.change(input, { target: { value: 'Run 3' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button')).toHaveTextContent('Run 1');
  });
});
