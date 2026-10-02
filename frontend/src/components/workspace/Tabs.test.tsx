import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type TabOption, TabPanel, Tabs } from '../ui/controls';

type Section = 'a' | 'b' | 'c';
const options: TabOption<Section>[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
];

/** Tabs with their panel; `collapsible` collapses on a second click, like
 *  the measurement card's sections. */
function Harness({
  initial,
  collapsible = false,
}: {
  initial: Section | null;
  collapsible?: boolean;
}) {
  const [value, setValue] = useState<Section | null>(initial);
  return (
    <>
      <Tabs
        idBase="t"
        label="Sections"
        value={value}
        options={options}
        onChange={(v) => setValue(collapsible && v === value ? null : v)}
      />
      {value && (
        <TabPanel idBase="t" value={value}>
          Content {value}
        </TabPanel>
      )}
    </>
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });

describe('Tabs', () => {
  it('is a tablist whose selected tab names and controls its panel', () => {
    render(<Harness initial="b" />);
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    const panel = screen.getByRole('tabpanel', { name: 'Beta' });
    expect(tab('Beta')).toHaveAttribute('aria-controls', panel.id);
    // One tab stop for the list: the selected tab.
    expect(tabs.map((t) => t.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('selects with the arrow keys, Home and End while a panel shows', () => {
    render(<Harness initial="a" />);
    tab('Alpha').focus();
    fireEvent.keyDown(tab('Alpha'), { key: 'ArrowRight' });
    expect(tab('Beta')).toHaveFocus();
    expect(tab('Beta')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content b');

    fireEvent.keyDown(tab('Beta'), { key: 'End' });
    expect(tab('Gamma')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tab('Gamma'), { key: 'ArrowRight' });
    expect(tab('Alpha')).toHaveFocus();
    fireEvent.keyDown(tab('Alpha'), { key: 'ArrowLeft' });
    expect(tab('Gamma')).toHaveFocus();
    fireEvent.keyDown(tab('Gamma'), { key: 'Home' });
    expect(tab('Alpha')).toHaveAttribute('aria-selected', 'true');
  });

  it('only moves focus while nothing is selected, and reports every click', () => {
    const onChange = vi.fn();
    render(<Tabs idBase="t" label="Sections" value={null} options={options} onChange={onChange} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(tabs[1]).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(tabs[1]);
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('lets the caller collapse on a second click', () => {
    render(<Harness initial={null} collapsible />);
    fireEvent.click(tab('Beta'));
    expect(screen.getByRole('tabpanel', { name: 'Beta' })).toHaveTextContent('Content b');
    fireEvent.click(tab('Beta'));
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(tab('Beta')).toHaveAttribute('aria-selected', 'false');
  });
});
