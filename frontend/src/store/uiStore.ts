// View state for the project workspace: how the 3D waterfall is drawn, which
// overlays are on and what the floating cards have expanded. Not persisted
// (the user's annotations are saved with the project, on the server);
// `resetForProject` clears everything that belongs to one measurement so it
// never leaks into the next project, and applies the user's view defaults
// (Settings: default view and scale).
import { create } from 'zustand';

import { useSettingsStore } from './settingsStore';

export type AmpScaleMode = 'linear' | 'log';
export type AnalysisPanel = 'condition' | 'sources' | 'machine';
export type DisplayTab = 'surface' | 'overlays' | 'annotations';
export type ViewMode = '3d' | 'top';
/** Which suggested resonance zones show: the likely ones that matter, or all. */
export type ZoneFilter = 'strong' | 'all';

/** A point on the surface the user clicked while picking one. */
export interface PickedPoint {
  freqHz: number;
  rpm: number;
}

interface UIState {
  // ── Camera ────────────────────────────────────────────────────────
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  /** Bumped by "Reset view"; the scene re-frames the camera on change. */
  cameraResetSignal: number;
  resetCamera: () => void;
  /** Bumped by "Save image"; the scene downloads a PNG of the view. */
  exportSignal: number;
  requestExport: () => void;

  // ── Surface ───────────────────────────────────────────────────────
  ampScaleMode: AmpScaleMode;
  setAmpScaleMode: (m: AmpScaleMode) => void;
  /** Vertical exaggeration of the surface; 1 = neutral. */
  heightScale: number;
  setHeightScale: (v: number) => void;
  /** Only rows within [min, max] rpm are drawn; null = whole sweep. */
  rpmFilter: { min: number; max: number } | null;
  setRpmFilter: (min: number, max: number) => void;
  clearRpmFilter: () => void;
  /** Only frequencies within [min, max] Hz are drawn; null = all. */
  freqFilter: { min: number; max: number } | null;
  setFreqFilter: (min: number, max: number) => void;
  clearFreqFilter: () => void;

  // ── Overlays ──────────────────────────────────────────────────────
  /** Order lines of the machine's components across the sweep. */
  showOrderLines: boolean;
  toggleOrderLines: () => void;
  /** Highest order drawn. */
  maxLineOrder: number;
  setMaxLineOrder: (order: number) => void;
  showPeaks: boolean;
  togglePeaks: () => void;
  /** Components whose lines and peaks are hidden. */
  hiddenSourceIds: string[];
  toggleSourceVisibility: (sourceId: string) => void;
  /** Suggested resonance zones (and the profile's known ones). */
  showZones: boolean;
  toggleZones: () => void;
  zoneFilter: ZoneFilter;
  setZoneFilter: (filter: ZoneFilter) => void;
  /** Speed-independent lines (mains, structure). */
  showStationary: boolean;
  toggleStationary: () => void;
  /** The user's saved annotations. */
  showAnnotations: boolean;
  toggleAnnotations: () => void;
  showStructuralModes: boolean;
  toggleStructuralModes: () => void;
  showSpectrumLines: boolean;
  toggleSpectrumLines: () => void;
  /** Alarm + shutdown planes (absolute mm/s), seeded from the rating. */
  showThresholds: boolean;
  toggleThresholds: () => void;
  /** Tint the surface where it rises above the alarm and shutdown levels. */
  showThresholdHighlight: boolean;
  toggleThresholdHighlight: () => void;
  /** The alarm level (mm/s). */
  alarmMmS: number;
  /** The shutdown level (mm/s). */
  shutdownMmS: number;
  setAlarmMmS: (v: number) => void;
  setShutdownMmS: (v: number) => void;
  setThresholds: (alarm: number, shutdown: number) => void;

  // ── Picking a point for an annotation ─────────────────────────────
  /** The next click on the surface is taken as a point (not a rotation). */
  picking: boolean;
  setPicking: (on: boolean) => void;
  picked: PickedPoint | null;
  setPicked: (point: PickedPoint | null) => void;

  // ── Panels ────────────────────────────────────────────────────────
  /** 2D spectrum of the hovered (or pinned) speed, under the 3D view. */
  showSlice: boolean;
  toggleSlice: () => void;
  /** Section expanded in the measurement card (null = collapsed). */
  analysisPanel: AnalysisPanel | null;
  setAnalysisPanel: (panel: AnalysisPanel | null) => void;
  /** Display settings expanded in the view card. */
  displayOpen: boolean;
  setDisplayOpen: (open: boolean) => void;
  displayTab: DisplayTab;
  setDisplayTab: (tab: DisplayTab) => void;

  resetForProject: () => void;
}

const PROJECT_DEFAULTS = {
  rpmFilter: null,
  freqFilter: null,
  hiddenSourceIds: [] as string[],
  picking: false,
  picked: null,
  cameraResetSignal: 0,
  exportSignal: 0,
  analysisPanel: null,
  displayOpen: false,
};

/** The user's view defaults, from Settings. */
function userDefaults(): { viewMode: ViewMode; ampScaleMode: AmpScaleMode } {
  const { default_view, default_scale } = useSettingsStore.getState();
  return { viewMode: default_view, ampScaleMode: default_scale };
}

export const useUIStore = create<UIState>((set) => ({
  ...userDefaults(),
  setViewMode: (m) => set({ viewMode: m }),
  cameraResetSignal: 0,
  resetCamera: () => set((s) => ({ cameraResetSignal: s.cameraResetSignal + 1 })),
  exportSignal: 0,
  requestExport: () => set((s) => ({ exportSignal: s.exportSignal + 1 })),

  setAmpScaleMode: (m) => set({ ampScaleMode: m }),
  heightScale: 1,
  setHeightScale: (v) => set({ heightScale: clamp(v, 0.2, 3) }),
  rpmFilter: null,
  setRpmFilter: (min, max) => set({ rpmFilter: { min, max } }),
  clearRpmFilter: () => set({ rpmFilter: null }),
  freqFilter: null,
  setFreqFilter: (min, max) => set({ freqFilter: { min, max } }),
  clearFreqFilter: () => set({ freqFilter: null }),

  showOrderLines: true,
  toggleOrderLines: () => set((s) => ({ showOrderLines: !s.showOrderLines })),
  maxLineOrder: 3,
  setMaxLineOrder: (order) => set({ maxLineOrder: clamp(Math.round(order), 1, 50) }),
  showPeaks: false,
  togglePeaks: () => set((s) => ({ showPeaks: !s.showPeaks })),
  hiddenSourceIds: [],
  toggleSourceVisibility: (id) =>
    set((s) => ({
      hiddenSourceIds: s.hiddenSourceIds.includes(id)
        ? s.hiddenSourceIds.filter((x) => x !== id)
        : [...s.hiddenSourceIds, id],
    })),
  showZones: true,
  toggleZones: () => set((s) => ({ showZones: !s.showZones })),
  zoneFilter: 'strong',
  setZoneFilter: (filter) => set({ zoneFilter: filter }),
  showStationary: true,
  toggleStationary: () => set((s) => ({ showStationary: !s.showStationary })),
  showAnnotations: true,
  toggleAnnotations: () => set((s) => ({ showAnnotations: !s.showAnnotations })),
  showStructuralModes: true,
  toggleStructuralModes: () => set((s) => ({ showStructuralModes: !s.showStructuralModes })),
  showSpectrumLines: false,
  toggleSpectrumLines: () => set((s) => ({ showSpectrumLines: !s.showSpectrumLines })),
  showThresholds: false,
  toggleThresholds: () => set((s) => ({ showThresholds: !s.showThresholds })),
  showThresholdHighlight: false,
  toggleThresholdHighlight: () =>
    set((s) => ({ showThresholdHighlight: !s.showThresholdHighlight })),
  // The strictest bowl class's levels, until a rating seeds them (Workspace).
  alarmMmS: 14,
  shutdownMmS: 18,
  setAlarmMmS: (v) => set({ alarmMmS: clamp(v, 0, 200) }),
  setShutdownMmS: (v) => set({ shutdownMmS: clamp(v, 0, 200) }),
  setThresholds: (alarm, shutdown) =>
    set({ alarmMmS: clamp(alarm, 0, 200), shutdownMmS: clamp(shutdown, 0, 200) }),

  picking: false,
  setPicking: (on) => set({ picking: on }),
  picked: null,
  setPicked: (point) => set({ picked: point }),

  showSlice: false,
  toggleSlice: () => set((s) => ({ showSlice: !s.showSlice })),
  analysisPanel: null,
  setAnalysisPanel: (panel) => set({ analysisPanel: panel }),
  displayOpen: false,
  setDisplayOpen: (open) => set({ displayOpen: open }),
  displayTab: 'surface',
  setDisplayTab: (tab) => set({ displayTab: tab }),

  resetForProject: () => set({ ...PROJECT_DEFAULTS, ...userDefaults() }),
}));

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}
