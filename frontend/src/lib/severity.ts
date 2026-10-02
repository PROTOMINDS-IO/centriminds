// Presentation of the decanter permissible-vibration zones. One place for the
// colours so the badge, the trend chart, the 3D view and the project list
// always agree; the labels live in the dictionaries (i18n: zones.*). Colours
// are the fixed status palette (good / warning / serious / critical), the
// same in both themes, and always ship next to a text label.
import type { SeverityZone } from '../api/types';
import type { I18n } from '../i18n';

export interface ZoneStyle {
  /** Status colour for dots, bars and planes. */
  hex: string;
  /** Tailwind classes for a tinted pill; the text tone follows the theme. */
  pill: string;
}

export const ZONES: Record<SeverityZone, ZoneStyle> = {
  good: {
    hex: '#0ca30c',
    pill: 'bg-zone-good/15 text-zone-good-text ring-1 ring-zone-good/40',
  },
  usable: {
    hex: '#fab219',
    pill: 'bg-zone-usable/15 text-zone-usable-text ring-1 ring-zone-usable/40',
  },
  alarm: {
    hex: '#ec835a',
    pill: 'bg-zone-alarm/15 text-zone-alarm-text ring-1 ring-zone-alarm/40',
  },
  shutdown: {
    hex: '#d03b3b',
    pill: 'bg-zone-shutdown/20 text-zone-shutdown-text ring-1 ring-zone-shutdown/50',
  },
};

/** Best to worst; the index is the zone's rank. */
export const ZONE_ORDER: SeverityZone[] = ['good', 'usable', 'alarm', 'shutdown'];

export const zoneLabel = (zone: SeverityZone, t: I18n['t']) => t(`zones.${zone}`);
