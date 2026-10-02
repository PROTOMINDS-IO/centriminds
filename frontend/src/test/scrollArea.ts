// Whether absolutely positioned content stays inside its scroll area, for the
// tests. They cannot measure layout (jsdom has none, and they run without the
// stylesheet), so this checks the structure that decides it: an absolutely
// positioned element, sr-only text included, is laid out against its nearest
// positioned ancestor. With none, or with a scroll area in between, it
// neither scrolls with that area nor is clipped by it, and with none it can
// stretch the document (see components/PageScroll.tsx). Positions and
// overflow are read from the Tailwind classes and inline styles.

const ABSOLUTE = /(?:^|\s)(?:absolute|sr-only)(?=\s|$)/;
const POSITIONED = /(?:^|\s)(?:relative|absolute|fixed|sticky|sr-only)(?=\s|$)/;
const CLIPS = /(?:^|\s)overflow(?:-[xy])?-(?:auto|scroll|hidden|clip)(?=\s|$)/;

const classes = (el: HTMLElement) => el.getAttribute('class') ?? '';
const isAbsolute = (el: HTMLElement) =>
  ABSOLUTE.test(classes(el)) || el.style.position === 'absolute';
const isPositioned = (el: HTMLElement) =>
  POSITIONED.test(classes(el)) ||
  ['relative', 'absolute', 'fixed', 'sticky'].includes(el.style.position);
const clips = (el: HTMLElement) =>
  CLIPS.test(classes(el)) ||
  [el.style.overflow, el.style.overflowX, el.style.overflowY].some((v) =>
    ['auto', 'scroll', 'hidden', 'clip'].includes(v),
  );

/** The absolutely positioned elements under `root` that escape their scroll
 *  area, described for the failure message; empty when none do. */
export function escapedFromScrollArea(root: ParentNode): string[] {
  const escaped: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (!isAbsolute(el)) continue;
    let area: HTMLElement | null = null;
    let block: HTMLElement | null = null;
    for (let p = el.parentElement; p && !block; p = p.parentElement) {
      if (!area && clips(p)) area = p;
      if (isPositioned(p)) block = p;
    }
    if (!block || (area && area !== block)) {
      const name =
        el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('type') || '';
      escaped.push(`<${el.tagName.toLowerCase()} class="${classes(el)}"> ${name}`);
    }
  }
  return escaped;
}
