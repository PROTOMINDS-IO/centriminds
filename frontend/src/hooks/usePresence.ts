import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '../lib/motion';

/**
 * Keeps something mounted while it animates out. `mounted` turns true with
 * `open`, and turns false `exitMs` after `open` does; in between `exiting`
 * is true, so the element can play its closing animation. The default
 * outlasts the longest closing transition: a card narrowing (card-grow in
 * index.css, 260 ms), ahead of a Reveal (250 ms) and a sheet (220 ms).
 */
export function usePresence(open: boolean, exitMs = 260) {
  const [lingering, setLingering] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  // Adjust state while rendering (react.dev "storing information from
  // previous renders"): closing starts the linger in the same render.
  // Under reduced motion there is no closing animation to wait for.
  if (open !== wasOpen) {
    setWasOpen(open);
    setLingering(!open && !prefersReducedMotion());
  }
  useEffect(() => {
    if (!lingering) return;
    const id = setTimeout(() => setLingering(false), exitMs);
    return () => clearTimeout(id);
  }, [lingering, exitMs]);
  return { mounted: open || lingering, exiting: !open && lingering };
}
