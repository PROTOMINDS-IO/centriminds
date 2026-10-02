// Choice of the surface colour scheme (lib/colormaps.ts): cards with a
// gradient preview on the Settings page, a row of swatches in the display
// panel. Both write the account setting and show each scheme in its variant
// for the theme in effect. Native radios underneath, so arrow keys and
// screen readers work as for any radio group.
import { useId } from 'react';

import { useI18n } from '../i18n';
import { COLORMAPS, colormapGradient, type ColormapId } from '../lib/colormaps';
import { useResolvedTheme } from '../lib/theme';
import { useSettingsStore } from '../store/settingsStore';
import ChoiceCards from './ui/ChoiceCards';

export default function ColormapPicker({
  label,
  compact = false,
}: {
  /** Name of the group for assistive technology. */
  label: string;
  /** Swatches only (display panel) instead of cards with names (Settings). */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const theme = useResolvedTheme();
  const value = useSettingsStore((s) => s.colormap);
  const update = useSettingsStore((s) => s.update);
  const group = useId();
  const name = (id: ColormapId) => t(`colormaps.${id}`);
  const choose = (id: ColormapId) => update({ colormap: id });

  if (!compact) {
    return (
      <ChoiceCards
        label={label}
        value={value}
        onChange={choose}
        className="grid-cols-2 gap-2 sm:grid-cols-5"
        options={COLORMAPS.map((id) => ({
          value: id,
          label: name(id),
          preview: (
            <span
              aria-hidden
              className="block h-4 w-full rounded-sm ring-1 ring-edge/10"
              style={{ background: colormapGradient(id, theme) }}
            />
          ),
        }))}
      />
    );
  }

  // `relative`: the radios (sr-only, so absolutely positioned) sit on their
  // swatches and scroll with them. Placed against the card or sheet around the
  // scrolling panel instead, they would stay put while the swatches move, and
  // focusing one would not bring its swatch into view.
  return (
    <fieldset className="relative flex items-center gap-1.5">
      <legend className="sr-only">{label}</legend>
      {COLORMAPS.map((id) => {
        const checked = id === value;
        return (
          <label
            key={id}
            title={name(id)}
            className={`block h-5 w-8 cursor-pointer rounded-md transition-shadow has-focus-visible:ring-2 has-focus-visible:ring-accent-400/60 ${
              checked
                ? 'ring-2 ring-accent-400 ring-offset-1 ring-offset-ink-800'
                : 'ring-1 ring-edge/15 hover:ring-edge/40'
            }`}
            style={{ background: colormapGradient(id, theme) }}
          >
            <input
              type="radio"
              className="sr-only"
              name={group}
              value={id}
              checked={checked}
              onChange={() => choose(id)}
              aria-label={name(id)}
            />
          </label>
        );
      })}
    </fieldset>
  );
}
