/** True when the person asked their system for less motion: animations and
 *  camera glides then jump straight to their end. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
