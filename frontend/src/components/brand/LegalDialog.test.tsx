import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LegalDialog from './LegalDialog';

describe('LegalDialog', () => {
  it('keeps Tab inside the dialog', () => {
    render(<LegalDialog onClose={() => {}} />);
    const close = screen.getByRole('button', { name: 'Close' });
    const links = screen.getAllByRole('link');
    const last = links[links.length - 1];
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<LegalDialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
