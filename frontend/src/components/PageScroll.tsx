import type { ReactNode } from 'react';

/**
 * The scroll area of a page under the top bar (the project list, Upload,
 * Settings): it fills <main> and scrolls on its own, so the bar stays put.
 *
 * `relative` makes it the containing block of the absolutely positioned
 * content inside, above all sr-only text (legends, "opens in a new tab").
 * Without a positioned ancestor that content is placed against the document,
 * at its spot far down the page, and makes the document taller than the
 * window: once this area is at its end, further scrolling moves the whole app
 * off screen. <main> would not do: the content would still not scroll with
 * this area, and <main> would take the extra height instead.
 */
export default function PageScroll({ children }: { children: ReactNode }) {
  return <div className="relative h-full overflow-auto">{children}</div>;
}
