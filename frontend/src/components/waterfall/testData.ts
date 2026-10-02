// Shared fixtures for the waterfall unit tests.
import type { SpectrogramRead } from '../../api/types';

/** A coast-down: rows recorded from fast to slow, like many exports. */
export function coastDown(
  nRows = 12,
  nBins = 16,
  peak?: { row: number; bin: number; amp: number },
) {
  const speeds = Array.from({ length: nRows }, (_, i) => 3000 - i * 250); // 3000 … 250
  const z = speeds.map(() => Array.from({ length: nBins }, () => 1));
  if (peak) z[peak.row][peak.bin] = peak.amp;
  const spec: SpectrogramRead = {
    project_id: 1,
    n_blocks: nRows,
    bin_count: nBins,
    source_n_blocks: nRows,
    source_bin_count: nBins,
    freq_axis: Array.from({ length: nBins }, (_, i) => i * 10),
    ref_speeds: speeds,
    ref_loads: speeds.map(() => 0),
    dates_unix: speeds.map(() => 0),
    dates_human: speeds.map(() => ''),
    z_matrix: z,
  };
  return spec;
}

/** One block per speed, in file order. Block i is flat at 1 mm/s but for a
 *  peak of 5 + i mm/s at bin i, so a drawn spectrum shows which block it is. */
export function blocksAt(speeds: number[], nBins = 16) {
  const spec: SpectrogramRead = {
    project_id: 1,
    n_blocks: speeds.length,
    bin_count: nBins,
    source_n_blocks: speeds.length,
    source_bin_count: nBins,
    freq_axis: Array.from({ length: nBins }, (_, i) => i * 10),
    ref_speeds: speeds,
    ref_loads: speeds.map(() => 0),
    dates_unix: speeds.map(() => 0),
    dates_human: speeds.map(() => ''),
    z_matrix: speeds.map((_, i) => Array.from({ length: nBins }, (_, b) => (b === i ? 5 + i : 1))),
  };
  return spec;
}
