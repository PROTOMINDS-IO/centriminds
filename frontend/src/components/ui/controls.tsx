// Small controls shared across the app: the compact buttons and tabs of the
// floating cards, switches, segmented choices, form fields and loading
// states. Styling lives here once; callers pass state and handlers.
import { useId } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';

import { useI18n } from '../../i18n';
import { CloseIcon } from './icons';

/** Keyboard focus ring of the compact controls (no offset: they sit on cards). */
export const FOCUS_RING =
  'focus-visible:ring-2 focus-visible:ring-accent-400/60 focus-visible:outline-hidden';

/** Border, colours and focus of the small inputs in panels and tables; the
 *  caller adds the size (COMPACT_FIELD, the profile editor's cells). */
export const FIELD_SURFACE =
  'rounded-md border border-ink-600 bg-ink-900/70 text-ink-100 placeholder:text-ink-400 focus:border-accent-400 focus:outline-hidden';
/** A small input of the display and annotation panels. 16px text on phones,
 *  so iOS Safari does not zoom into a focused field. */
export const COMPACT_FIELD = `${FIELD_SURFACE} px-1.5 py-1 text-base sm:text-xs`;
/** The accent button of those panels ("Apply", "Save"). */
export const COMPACT_ACTION = `rounded-md border border-accent-400/40 bg-accent-500/15 px-2 py-1 font-medium text-accent-200 hover:bg-accent-500/25 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`;

/** The compact controls on the floating cards over the 3D view (tabs, toolbar
 *  buttons, the back link): one height, one text size, one focus ring. */
export const CHROME_BUTTON =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-accent-400/60 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50';
/** Selected tab, pressed toggle, expanded section. */
const CHROME_ON = 'bg-accent-500/15 text-accent-200 ring-1 ring-accent-400/40 ring-inset';
export const CHROME_OFF = 'text-ink-200 hover:bg-edge/[0.07] hover:text-ink-50';

/** A compact control of the floating chrome; `square` for an icon alone. */
export function ChromeButton({
  on = false,
  square = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean; square?: boolean }) {
  return (
    <button
      type={type}
      {...rest}
      className={`${CHROME_BUTTON} ${square ? 'w-8' : 'px-2.5'} ${on ? CHROME_ON : CHROME_OFF} ${className}`}
    />
  );
}

/** Square close button at the end of a row. */
export function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ChromeButton square title={label} aria-label={label} onClick={onClick} className="ml-auto">
      <CloseIcon />
    </ChromeButton>
  );
}

/** Thin vertical rule between groups of a toolbar. */
export function ToolbarDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-edge/10" />;
}

export interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the visible label is not plain text. */
  ariaLabel?: string;
  title?: string;
}

const tabId = (base: string, value: string) => `${base}-tab-${value}`;
const tabPanelId = (base: string) => `${base}-panel`;

/**
 * Tabs (role="tablist"). `value` may be null: nothing selected, as in a card
 * whose sections are all collapsed. Every click reports its tab, including
 * the selected one, so a caller can collapse on a second click. Arrow keys,
 * Home and End move between the tabs; while a panel shows they also select.
 * Show the selected tab's content in a <TabPanel> with the same `idBase`.
 */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  idBase,
  className = '',
}: {
  value: T | null;
  options: TabOption<T>[];
  onChange: (v: T) => void;
  label: string;
  idBase: string;
  className?: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const n = options.length;
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % n
        : e.key === 'ArrowLeft'
          ? (index - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
    if (value !== null && options[next].value !== value) onChange(options[next].value);
  }

  return (
    <div role="tablist" aria-label={label} className={`flex items-center gap-1 ${className}`}>
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <ChromeButton
            key={o.value}
            id={tabId(idBase, o.value)}
            role="tab"
            aria-selected={selected}
            aria-controls={selected ? tabPanelId(idBase) : undefined}
            aria-label={o.ariaLabel}
            title={o.title}
            // One tab stop for the whole list: the selected tab, else the first.
            tabIndex={selected || (value === null && i === 0) ? 0 : -1}
            on={selected}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </ChromeButton>
        );
      })}
    </div>
  );
}

/** The content of the selected tab of the <Tabs> with the same `idBase`;
 *  named by that tab unless `label` gives a plainer name. */
export function TabPanel({
  idBase,
  value,
  label,
  className = '',
  children,
}: {
  idBase: string;
  value: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={tabPanelId(idBase)}
      role="tabpanel"
      aria-labelledby={label ? undefined : tabId(idBase, value)}
      aria-label={label}
      className={className}
    >
      {children}
    </div>
  );
}

/** On/off switch rendered as a full-width row with its label. */
export function Toggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  /** Explanation under the label, announced with the switch. */
  hint?: string;
  on: boolean;
  onToggle: () => void;
}) {
  const hintId = useId();
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={hint ? hintId : undefined}
        onClick={onToggle}
        className={`flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-ink-200 hover:text-ink-50 ${FOCUS_RING}`}
      >
        {label}
        <span
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-accent-500' : 'bg-ink-500'}`}
        >
          <span
            className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${on ? 'left-3.5' : 'left-0.5'}`}
          />
        </span>
      </button>
      {hint && (
        <p id={hintId} className="mt-0.5 pr-12 text-xs text-ink-300">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Choose one of a few options. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div
      className="inline-flex h-8 shrink-0 rounded-lg border border-edge/10 bg-edge/[0.04] p-0.5 text-xs"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={o.title}
          className={`rounded-md px-2.5 font-medium whitespace-nowrap transition-colors ${FOCUS_RING} ${
            value === o.value
              ? 'bg-ink-600 text-ink-50 shadow-sm light:bg-ink-800'
              : 'text-ink-300 hover:text-ink-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Square icon button of the floating chrome. `title` is its name (and
 *  tooltip unless `tooltip` says more); `active` marks a pressed toggle. */
export function IconButton({
  title,
  tooltip,
  active,
  onClick,
  className = '',
  children,
}: {
  title: string;
  tooltip?: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ChromeButton
      square
      title={tooltip ?? title}
      aria-label={title}
      aria-pressed={active}
      on={active}
      onClick={onClick}
      className={className}
    >
      {children}
    </ChromeButton>
  );
}

/** Label + control + optional hint, wired for accessibility via `htmlFor`. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-ink-300">{hint}</p>}
    </div>
  );
}

/** Pulsing dot used for loading states. */
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <span
      className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent-400"
      role="status"
      aria-label={label ?? t('common.loading')}
    />
  );
}

/** Centred loading state with an optional message. */
export function Loading({ children }: { children?: ReactNode }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex items-center gap-3 text-sm text-ink-300">
        <Spinner />
        {children}
      </div>
    </div>
  );
}
