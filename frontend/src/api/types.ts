// TypeScript mirrors of the backend's wire format: the Pydantic schemas in
// `backend/app/schemas.py` and, for analysis results, the dataclasses in
// `backend/app/analysis/`. Keep them in step; where a name differs from the
// backend's, the type says so.

/** Per-account settings (backend `UserSettings`); always complete on read. */
export interface UserSettings {
  theme: 'system' | 'light' | 'dark';
  /** 'auto' follows the browser's language. */
  language: 'auto' | 'en' | 'de';
  /** null = device default (on unless the OS asks for reduced motion). */
  auto_rotate: boolean | null;
  default_view: '3d' | 'top';
  default_scale: 'linear' | 'log';
  /** Colour scheme of amplitude surfaces (lib/colormaps.ts). */
  colormap: ColormapId;
  /** How the colour scheme spreads over amplitude on the linear scale
   *  (waterfall/model.ts). */
  colour_spread: ColourSpread;
}

export type ColourSpread = 'even' | 'balanced' | 'detail';

export type ColormapId = 'viridis' | 'magma' | 'ocean' | 'teal' | 'graphite';

export interface UserRead {
  id: number;
  email: string;
  name: string;
  created_at: string;
  settings: UserSettings;
}

/** PATCH /api/auth/me: only the keys sent are changed. */
export interface UserUpdate {
  name?: string;
  settings?: Partial<UserSettings>;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserRead;
}

/** Backend `UserCreate`. */
export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Backend `MeasurementMetadataRead`. */
export interface MeasurementMetadata {
  sensor_location: string | null;
  sensor_direction: string | null;
  unit: string;
  operator: string | null;
  site: string | null;
}

/** A project as the list shows it (backend `ProjectRead`). */
export interface ProjectSummary {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  /** null = the generic built-in profile. */
  machine_profile_id: number | null;
  /** The profile's name (the generic one's when none is set). */
  machine_name: string;
  /** This measurement's overrides of the profile's parameters, by key. */
  machine_parameters: Record<string, number>;
  notes_markdown: string;
  status: 'new' | 'annotated' | 'reviewed';
  odx_filename: string;
  odx_hash: string;
  n_blocks: number;
  bin_count: number;
  freq_min_hz: number;
  freq_max_hz: number;
  freq_step_hz: number;
  rpm_min: number;
  rpm_max: number;
  // From the export's header: the measurement's path in the Omnitrend tree,
  // the export date as written there, and the format line.
  odx_header_path: string | null;
  odx_export_human: string | null;
  odx_format_version: string | null;
  /** The profile recognised from the header path or file name on upload. */
  detected_profile_id: number | null;
  bowl_diameter_mm: number | null;
  /** Latest rating, list view only; null until the project is analysed. */
  severity_zone?: string | null;
  severity_mm_s?: number | null;
}

/** A tiny spectrogram for a project-list row: rows by ascending speed,
 *  amplitudes scaled to 0–1 of its own maximum. */
export interface ThumbnailRead {
  project_id: number;
  n_blocks: number;
  bin_count: number;
  rpm_min: number;
  rpm_max: number;
  freq_min_hz: number;
  freq_max_hz: number;
  z_matrix: number[][];
}

/** PATCH /api/projects/{id} (backend `ProjectUpdate`): only the keys sent
 *  are changed. null clears `bowl_diameter_mm` and, for
 *  `machine_profile_id`, selects the generic profile; inside
 *  `measurement_metadata` every key sent is applied, null included. */
export interface ProjectUpdate {
  name?: string;
  notes_markdown?: string;
  status?: ProjectSummary['status'];
  machine_profile_id?: number | null;
  /** Replaces the overrides of the profile's parameters. */
  machine_parameters?: Record<string, number>;
  bowl_diameter_mm?: number | null;
  measurement_metadata?: Partial<{
    [K in keyof MeasurementMetadata]: MeasurementMetadata[K] | null;
  }>;
}

export interface ProjectDetail extends ProjectSummary {
  measurement_metadata: MeasurementMetadata | null;
  /** Fingerprint of the analysis inputs; a run whose `params.inputs_hash`
   *  differs is out of date. */
  analysis_inputs_hash: string;
}

// ─── Machine profiles (backend app/physics/profile.py) ───────────────

export type ComponentKind = 'shaft' | 'belt' | 'gear_mesh' | 'electrical' | 'other';

export interface ProfileParameter {
  key: string;
  label: string;
  unit: string;
  value: number;
  /** Usually differs between measurements (differential speed, mains). */
  run_specific: boolean;
}

export interface ProfileComponent {
  key: string;
  label: string;
  kind: ComponentKind;
  /** Speed formula in rpm of n (the bowl speed), the parameters and the
   *  components declared before it. */
  speed_rpm: string;
  max_order: number;
}

export interface OperatingPoint {
  label: string;
  bowl_rpm: number;
  parameters: Record<string, number>;
  /** Expected component speeds (rpm), e.g. from a commissioning sheet. */
  reference_rpm: Record<string, number>;
}

export interface ProfileStructuralMode {
  name: string;
  freq_hz: number;
  source: string;
}

export interface FrequencyZone {
  label: string;
  lo_hz: number;
  hi_hz: number;
  source: string;
}

/** A machine profile document (format centriminds.machine-profile, v1). */
export interface MachineProfileData {
  format: 'centriminds.machine-profile';
  version: 1;
  name: string;
  machine_type: string;
  description: string;
  bowl_diameter_mm: number | null;
  /** Text in an export's path or file name that identifies the machine. */
  match_patterns: string[];
  parameters: ProfileParameter[];
  components: ProfileComponent[];
  operating_points: OperatingPoint[];
  structural_modes: ProfileStructuralMode[];
  resonance_zones: FrequencyZone[];
}

export interface MachineProfileRead {
  id: number;
  /** Shared by every account and read-only. */
  builtin: boolean;
  name: string;
  data: MachineProfileData;
  created_at: string;
  updated_at: string;
  /** The account's projects using it. */
  project_count: number;
}

export interface MachineProfileSaved extends MachineProfileRead {
  /** Projects without a profile that this one recognised and now uses. */
  assigned_projects: number;
}

export interface ProfileImportResponse {
  imported: { profile: MachineProfileSaved; source: string; warnings: string[] }[];
}

export interface ProfileTemplate {
  id: string;
  data: MachineProfileData;
}

export interface ComponentCheck {
  key: string;
  speed_rpm: number | null;
  freq_hz: number | null;
  reference_rpm: number | null;
  /** |computed| − |reference| (rpm). */
  delta_rpm: number | null;
  error: string | null;
}

export interface ProfileCheck {
  points: { label: string; bowl_rpm: number; components: ComponentCheck[] }[];
  /** Why the draft is not valid (`loc` like "components.2.speed_rpm", where
   *  every problem of a component's formula is reported); empty when it is,
   *  and `points` is filled. */
  problems: { loc: string; msg: string }[];
}

/** The speed sweep: one spectrum (block) per speed step. `z_matrix[i][j]` is
 *  the amplitude of block i at `freq_axis[j]`; `ref_speeds` (rpm),
 *  `ref_loads` (motor load, %) and the dates are per block. `source_*` give
 *  the file's full size, so the client can tell a downsample. */
export interface SpectrogramRead {
  project_id: number;
  n_blocks: number;
  bin_count: number;
  source_n_blocks: number;
  source_bin_count: number;
  freq_axis: number[];
  ref_speeds: number[];
  ref_loads: number[];
  dates_unix: number[];
  dates_human: string[];
  z_matrix: number[][];
}

/** A detected peak, matched to a harmonic of an excitation source where one
 *  lies close enough. */
export interface AttributedPeak {
  block_idx: number;
  rpm: number;
  freq_hz: number;
  amplitude: number;
  /** null, with harmonic 0, when no source matched. */
  source_id: string | null;
  harmonic: number;
  expected_freq_hz: number | null;
  delta_hz: number | null;
  /** 1 = exact match, 0 = at the matching tolerance. */
  confidence: number;
}

/** One component order drawn by an order line. */
export interface LineMember {
  component: string;
  order: number;
}

/** Where component orders lie across the sweep (`freq_hz` at each of `rpm`),
 *  and the strongest amplitude along it. Orders the measurement cannot tell
 *  apart share one line (`members`). */
export interface OrderLine {
  id: string;
  members: LineMember[];
  kind: 'mechanical' | 'electrical';
  rpm: number[];
  freq_hz: number[];
  peak_amp: number;
  peak_rpm: number;
  peak_freq_hz: number;
}

export interface ZoneEvidence {
  line_id: string;
  freq_hz: number;
  rpm: number;
  amplitude: number;
  prominence_db: number;
}

/** A frequency range where several tracked lines swell: a likely resonance. */
export interface ResonanceZone {
  lo_hz: number;
  hi_hz: number;
  center_hz: number;
  /** 0–1, how sure it is a resonance. */
  confidence: number;
  peak_amplitude: number;
  /** Peak amplitude / the strongest line's: how much it matters. */
  relative_amplitude: number;
  evidence: ZoneEvidence[];
  /** The profile's structural modes inside it. */
  modes: string[];
}

/** A line lit whatever the speed: the mains, structure or an outside source. */
export interface StationaryLine {
  freq_hz: number;
  width_hz: number;
  median_amp: number;
  max_amp: number;
  contrast: number;
  /** Share of the speed ranges it stands out in. */
  presence: number;
  kind: 'electrical' | 'structural' | 'unexplained';
  source: string | null;
  order: number | null;
}

/** The machine an analysis ran with. */
export interface AnalysedMachine {
  name: string;
  components: { key: string; label: string; kind: ComponentKind; max_order: number }[];
  parameters: Record<string, number>;
}

export type SeverityZone = 'good' | 'usable' | 'alarm' | 'shutdown';

/** Decanter permissible-vibration rating (mm/s RMS, bearing pillow blocks). */
export interface DecanterSeverity {
  zone: SeverityZone;
  /** The rated value: the highest overall velocity at operating speed (by
   *  default at least 90 % of the sweep's top speed). */
  velocity_mm_s: number;
  operating_rpm: number;
  /** Highest overall velocity anywhere in the sweep, transients included. */
  sweep_max_mm_s: number;
  sweep_max_rpm: number;
  sweep_max_zone: SeverityZone;
  diameter_class: string;
  diameter_class_label: string;
  bowl_diameter_mm: number | null;
  // Limits of the diameter class and the FAT reference levels (mm/s).
  good_below: number;
  alarm_at: number;
  shutdown_at: number;
  fat_new: number;
  fat_refurbished: number;
  /** The band the overall velocity sums over, its top capped at what the
   *  export covers. */
  band_lo_hz: number;
  band_hi_hz: number;
  /** How the spectrum lines were taken to be scaled (an analysis parameter). */
  amplitude_scale: 'rms' | 'peak';
  // Overall velocity of each spectrum, by ascending speed (the trend chart).
  trend_rpm: number[];
  trend_mm_s: number[];
}

/** A structural mode checked against the sweep: the speed at which the
 *  reference component's 1× (the bowl) crosses it, if it does within the
 *  sweep, and the strongest response within the search band. */
export interface StructuralModeCheck {
  name: string;
  source: string;
  freq_hz: number;
  crossing_component: string | null;
  crossing_rpm: number | null;
  search_lo_hz: number;
  search_hi_hz: number;
  response_mm_s: number | null;
  response_freq_hz: number | null;
  response_rpm: number | null;
}

/** The `results` of a physics analysis run (pipeline 3). Older runs lack
 *  most of it; the workspace re-runs them (their inputs hash differs). */
export interface PhysicsResults {
  machine?: AnalysedMachine;
  peaks: AttributedPeak[];
  order_lines?: OrderLine[];
  /** Every component's order-1 frequency on one speed grid. */
  component_lines?: { rpm: number[]; freq_hz: Record<string, number[]> };
  resonance_zones?: ResonanceZone[];
  stationary_lines?: StationaryLine[];
  /** The profile's known resonance zones. */
  known_zones?: FrequencyZone[];
  severity?: DecanterSeverity;
  structural_modes?: StructuralModeCheck[];
}

/** An analysis run; `R` is the type of its results (PhysicsResults for a
 *  physics run). */
export interface AnalysisRunRead<R = Record<string, unknown>> {
  id: number;
  project_id: number;
  type: 'physics';
  version: string;
  params: Record<string, unknown>;
  results: R;
  created_at: string;
}

/** What POST /projects/{id}/analyze answers: the run it stored (read it
 *  with the analyses) and how many annotations it added. */
export interface AnalyzeResponse {
  project_id: number;
  run_id: number;
  version: string;
  created_at: string;
  annotations_created: number;
}

export type UserAnnotationType = 'band' | 'note' | 'order_line' | 'frequency_line' | 'speed_line';

/** A user's annotation on the waterfall (backend `AnnotationWrite`):
 *  frequency_line: freq_hz · speed_line: rpm · band: freq_hz–freq_hz_end
 *  (optionally rpm–rpm_end) · note: at freq_hz, rpm · order_line: `order` ×
 *  the measured speed. `color` is a palette slot ("slot:2") or #rrggbb. */
export interface AnnotationWrite {
  annotation_type: UserAnnotationType;
  freq_hz?: number | null;
  freq_hz_end?: number | null;
  rpm?: number | null;
  rpm_end?: number | null;
  label?: string;
  color?: string;
  text?: string;
  order?: number | null;
  component?: string | null;
}

export interface AnnotationRead {
  id: number;
  project_id: number;
  annotation_type: string;
  freq_hz: number | null;
  freq_hz_end: number | null;
  rpm: number | null;
  rpm_end: number | null;
  amplitude: number | null;
  label: string;
  color: string;
  author: 'user' | 'auto_physics';
  confidence: number;
  status: string;
  created_at: string;
  payload: { text?: string; order?: number; component?: string } & Record<string, unknown>;
}

export interface AnalyzeRequest {
  /** Overrides of the pipeline defaults (backend `AnalysisParams`). */
  params?: Record<string, unknown>;
}
