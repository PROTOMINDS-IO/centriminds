// Texts shared by the 3D scene and the panels around it: numbers in the
// locale's notation, and the machine data the backend names in English.
import type { I18n } from '../../i18n';

const NBSP = '\u00a0';

/** Up to three significant digits in the locale's notation (axis ticks, levels). */
export function tickText(v: number, fmt: I18n['fmt']): string {
  const r = Number(v.toPrecision(3));
  // fmt.number stops at two decimals, which would turn 0.004 into 0.
  return r !== 0 && Math.abs(r) < 0.01 ? fmt.number(r, 3) : fmt.number(r);
}

/** A frequency with the decimals it has (up to two): "50 Hz", "9.19 Hz". */
export function hzText(v: number, fmt: I18n['fmt']): string {
  return `${fmt.number(v)}${NBSP}Hz`;
}

/** Sensor directions the backend accepts (ALLOWED_DIRECTIONS in
 *  backend/app/models.py); names in i18n: workspace.machine.directions.*. */
export const SENSOR_DIRECTIONS = ['radial', 'axial', 'vertical', 'horizontal'] as const;
export type SensorDirection = (typeof SENSOR_DIRECTIONS)[number];

const isSensorDirection = (v: string): v is SensorDirection =>
  (SENSOR_DIRECTIONS as readonly string[]).includes(v);

/** A structural mode's name from the machine preset ("Rigid-body mode,
 *  vertical") in the user's language; names it does not know stay as sent. */
export function structuralModeName(name: string, { t, locale }: I18n): string {
  const m = /^rigid-body mode(?:,\s*(\w+))?$/i.exec(name.trim());
  if (!m) return name;
  const kind = t('workspace.modes.rigidBody');
  const direction = m[1]?.toLowerCase();
  if (!direction) return kind;
  if (!isSensorDirection(direction)) return `${kind}, ${m[1]}`;
  return `${kind}, ${t(`workspace.machine.directions.${direction}`).toLocaleLowerCase(locale)}`;
}
