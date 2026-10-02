// Shared fixtures for the workspace tests (not used by the app).
import type {
  DecanterSeverity,
  MachineProfileRead,
  PhysicsResults,
  ProjectDetail,
} from '../../api/types';
import { vi } from 'vitest';

import { coastDown } from '../waterfall/testData';

export const severity: DecanterSeverity = {
  zone: 'usable',
  velocity_mm_s: 11.5,
  operating_rpm: 3150,
  sweep_max_mm_s: 11.5,
  sweep_max_rpm: 3150,
  sweep_max_zone: 'usable',
  diameter_class: 'lt350',
  diameter_class_label: '< 350 mm',
  bowl_diameter_mm: null,
  good_below: 8,
  alarm_at: 14,
  shutdown_at: 18,
  fat_new: 5,
  fat_refurbished: 7,
  band_lo_hz: 10,
  band_hi_hz: 400,
  amplitude_scale: 'rms',
  trend_rpm: [100, 1000, 3150],
  trend_mm_s: [0.5, 3, 11.5],
};

export const physics: PhysicsResults = {
  machine: {
    name: 'Example decanter',
    components: [
      { key: 'bowl', label: 'Bowl', kind: 'shaft', max_order: 10 },
      { key: 'scroll', label: 'Scroll', kind: 'shaft', max_order: 10 },
      { key: 'mains', label: 'Mains', kind: 'electrical', max_order: 3 },
    ],
    parameters: { d: 8, f_mains: 50 },
  },
  order_lines: [
    {
      id: 'bowl@1+scroll@1',
      members: [
        { component: 'bowl', order: 1 },
        { component: 'scroll', order: 1 },
      ],
      kind: 'mechanical',
      rpm: [120, 3200],
      freq_hz: [2, 53.3],
      peak_amp: 4.2,
      peak_rpm: 3200,
      peak_freq_hz: 53.3,
    },
  ],
  resonance_zones: [
    {
      lo_hz: 62,
      hi_hz: 78,
      center_hz: 71.4,
      confidence: 1,
      peak_amplitude: 2.2,
      relative_amplitude: 1,
      evidence: [
        { line_id: 'bowl@3', freq_hz: 74.5, rpm: 1490, amplitude: 2.2, prominence_db: 16 },
        { line_id: 'scroll@3', freq_hz: 73.6, rpm: 1523, amplitude: 1.1, prominence_db: 9.7 },
      ],
      modes: [],
    },
  ],
  stationary_lines: [
    {
      freq_hz: 50,
      width_hz: 0.5,
      median_amp: 0.056,
      max_amp: 0.17,
      contrast: 3.9,
      presence: 1,
      kind: 'electrical',
      source: 'mains',
      order: 1,
    },
  ],
  known_zones: [],
  peaks: [
    {
      block_idx: 0,
      rpm: 3000,
      freq_hz: 50,
      amplitude: 4.2,
      source_id: 'bowl',
      harmonic: 1,
      expected_freq_hz: 50,
      delta_hz: 0,
      confidence: 0.92,
    },
  ],
  severity,
  structural_modes: [
    {
      name: 'Rigid-body mode, vertical',
      source: 'FE modal analysis',
      freq_hz: 9.1889,
      crossing_component: 'bowl',
      crossing_rpm: 551.3,
      search_lo_hz: 8.7,
      search_hi_hz: 9.6,
      response_mm_s: null,
      response_freq_hz: null,
      response_rpm: null,
    },
  ],
};

export const project: ProjectDetail = {
  id: 1,
  name: 'Demo sweep',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  machine_profile_id: 7,
  machine_name: 'Example decanter',
  machine_parameters: {},
  notes_markdown: '',
  status: 'new',
  odx_filename: 'demo-sweep.odx',
  odx_hash: 'abc',
  n_blocks: 12,
  bin_count: 16,
  freq_min_hz: 0,
  freq_max_hz: 400,
  freq_step_hz: 0.125,
  rpm_min: 120,
  rpm_max: 3200,
  odx_header_path: null,
  odx_export_human: null,
  odx_format_version: null,
  detected_profile_id: 7,
  bowl_diameter_mm: null,
  measurement_metadata: null,
  analysis_inputs_hash: 'abc123',
};

export const profile: MachineProfileRead = {
  id: 7,
  builtin: false,
  name: 'Example decanter',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  project_count: 1,
  data: {
    format: 'centriminds.machine-profile',
    version: 1,
    name: 'Example decanter',
    machine_type: 'Decanter centrifuge',
    description: '',
    bowl_diameter_mm: null,
    match_patterns: ['example decanter'],
    parameters: [
      { key: 'd', label: 'Differential speed', unit: 'rpm', value: 8, run_specific: true },
      { key: 'K1', label: 'Gearbox 1st stage ratio', unit: '', value: -60, run_specific: false },
      { key: 'f_mains', label: 'Mains frequency', unit: 'Hz', value: 50, run_specific: true },
    ],
    components: [
      { key: 'bowl', label: 'Bowl', kind: 'shaft', speed_rpm: 'n', max_order: 10 },
      { key: 'scroll', label: 'Scroll', kind: 'shaft', speed_rpm: 'n + d', max_order: 10 },
      { key: 'mains', label: 'Mains', kind: 'electrical', speed_rpm: '60 * f_mains', max_order: 3 },
    ],
    operating_points: [],
    structural_modes: [],
    resonance_zones: [],
  },
};

export const genericProfile: MachineProfileRead = {
  ...profile,
  id: 1,
  builtin: true,
  name: 'Generic (rotor speed only)',
  project_count: 0,
  data: { ...profile.data, name: 'Generic (rotor speed only)', match_patterns: [] },
};

export const spectrogram = coastDown();

/** Viewport narrower than the md breakpoint (phones). */
export function stubPhoneViewport() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}
