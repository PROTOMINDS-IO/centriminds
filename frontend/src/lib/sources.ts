// The components of a machine profile, as the analysis reports them
// (PhysicsResults.machine.components): their names come from the profile
// (user data, shown as written) and their colours from their place in it —
// the validated categorical slots of the reference palette, stepped per
// theme, fixed per position (never by rank). Electrical lines (the mains)
// are neutral, and drawn dashed. Markers always carry a text label as well.
import type { AnalysedMachine, LineMember, OrderLine } from '../api/types';
import { getI18n, type I18n } from '../i18n';
import type { ResolvedTheme } from './theme';

type Pair = Record<ResolvedTheme, string>;
export type Components = AnalysedMachine['components'];

const SLOTS: Pair[] = [
  { dark: '#3987e5', light: '#2a78d6' },
  { dark: '#d55181', light: '#e87ba4' },
  { dark: '#d95926', light: '#eb6834' },
  { dark: '#9085e9', light: '#4a3aa7' },
  { dark: '#008300', light: '#008300' },
  { dark: '#199e70', light: '#1baf7a' },
  { dark: '#c98500', light: '#eda100' },
];

const NEUTRAL: Pair = { dark: '#94a3b8', light: '#64748b' };

/** The theme applied to the page right now (for callers without the hook). */
function appliedTheme(): ResolvedTheme {
  return typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
}

/** Display name of a component (pass useI18n() in components). */
export function sourceLabel(
  id: string | null | undefined,
  components: Components = [],
  i18n: I18n = getI18n(),
): string {
  if (!id) return i18n.t('sources.unattributed');
  const known = components.find((c) => c.key === id);
  if (known) return known.label;
  const tidy = id.replace(/_/g, ' ');
  return tidy.charAt(0).toUpperCase() + tidy.slice(1);
}

/** Colour of a component for the given theme (pass useResolvedTheme() in components). */
export function sourceColour(
  id: string | null | undefined,
  components: Components = [],
  theme: ResolvedTheme = appliedTheme(),
): string {
  const index = components.findIndex((c) => c.key === id);
  if (index < 0 || components[index].kind === 'electrical') return NEUTRAL[theme];
  // Position among the mechanical components, so the mains takes no slot.
  const slot = components.slice(0, index).filter((c) => c.kind !== 'electrical').length;
  return SLOTS[slot % SLOTS.length][theme];
}

/** "Bowl + Scroll 1×" when the merged orders share one; "Belt 2× + Belt
 *  flex 1×" when not; at most `max` names, then "+2". */
export function lineLabel(
  line: Pick<OrderLine, 'members'>,
  components: Components = [],
  i18n: I18n = getI18n(),
  max = 3,
): string {
  const order = (m: LineMember) => i18n.t('workspace.sources.harmonic', { order: m.order });
  const shown = line.members.slice(0, max);
  const rest = line.members.length - shown.length;
  const same = line.members.every((m) => m.order === line.members[0].order);
  const names = same
    ? `${shown.map((m) => sourceLabel(m.component, components, i18n)).join(' + ')} ${order(shown[0])}`
    : shown.map((m) => `${sourceLabel(m.component, components, i18n)} ${order(m)}`).join(' + ');
  return rest > 0 ? `${names} +${rest}` : names;
}

/** The component orders of a line from its id ("bowl@1+scroll@1"), as the
 *  analysis names lines (backend analysis/orders.py). */
export function membersOf(lineId: string): LineMember[] {
  return lineId.split('+').map((part) => {
    const at = part.lastIndexOf('@');
    return { component: part.slice(0, at), order: Number(part.slice(at + 1)) };
  });
}
