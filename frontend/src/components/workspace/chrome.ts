// Behaviour and geometry shared by the floating cards over the 3D view: the
// breakpoint where they turn into bottom sheets, their expanded widths (the
// view centres the surface in the room they leave), and Escape to collapse.
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useUIStore } from '../../store/uiStore';
import type { Insets } from '../waterfall/framing';

/** md: below it an expanded section opens as a bottom sheet instead. */
const WIDE_MIN_PX = 768;
/** Expanded widths (rem): the measurement card (left) and the view card (right). */
export const LEFT_CARD_REM = 24;
export const RIGHT_CARD_REM = 22;
/** Cards sit this far from the view's edges (top-3, left-3, right-3). */
const MARGIN_PX = 12;

const WIDE_QUERY = `(min-width: ${WIDE_MIN_PX}px)`;

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia?.(WIDE_QUERY);
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}

/** True from the md breakpoint up (and where media queries are unavailable). */
export function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia?.(WIDE_QUERY).matches ?? true,
    () => true,
  );
}

/** Room an expanded card takes from the view: margin, card, gap to the surface. */
export const insetFor = (widthRem: number) => MARGIN_PX + widthRem * 16 + MARGIN_PX;

/** How much of the view the expanded cards cover on each side (none on
 *  phones, where sections open as sheets). */
export function useViewInsets(): Insets {
  const wide = useWide();
  const leftOpen = useUIStore((s) => s.analysisPanel !== null);
  const rightOpen = useUIStore((s) => s.displayOpen);
  const left = wide && leftOpen ? insetFor(LEFT_CARD_REM) : 0;
  const right = wide && rightOpen ? insetFor(RIGHT_CARD_REM) : 0;
  return useMemo(() => ({ left, right }), [left, right]);
}

export type Side = 'left' | 'right';

/**
 * Escape collapses what a card has open, unless it was pressed in a field
 * (there it discards the edit), while working in the other card, or
 * elsewhere on the page (the account menu in the page header closes on its
 * own Escape).
 * Chrome elements carry data-chrome="left|right" to tell the cards apart;
 * the workspace's root carries data-workspace.
 */
export function useCloseOnEscape(open: boolean, close: () => void, side: Side) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const owner = target?.closest('[data-chrome]')?.getAttribute('data-chrome');
      if (owner) {
        if (owner !== side) return;
      } else if (target && target !== document.body && !target.closest('[data-workspace]')) {
        return;
      }
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, side]);
}

/** Whether keyboard focus is inside a card (or its sheet) right now. */
export function focusIsIn(side: Side): boolean {
  return document.activeElement?.closest(`[data-chrome="${side}"]`) != null;
}
