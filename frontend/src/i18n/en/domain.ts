// Vibration vocabulary shared by the dashboard, the workspace and the 3D view.

/** Decanter permissible-vibration zones (lib/severity.ts holds the colours). */
export const zones = {
  good: 'Good',
  usable: 'Usable',
  alarm: 'Alarm',
  shutdown: 'Shutdown',
};

/** Surface colour schemes (lib/colormaps.ts). */
export const colormaps = {
  viridis: 'Viridis',
  magma: 'Magma',
  ocean: 'Ocean',
  teal: 'Teal',
  graphite: 'Graphite',
};

/** Peaks matched to no component (components are named by their profile). */
export const sources = {
  unattributed: 'Unattributed',
};
