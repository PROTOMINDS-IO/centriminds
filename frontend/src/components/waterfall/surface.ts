// Geometry for the waterfall surface and exact pointer picking on it.
import * as THREE from 'three';

import { DEFAULT_COLORMAP, colormap, hexToRgb, srgbToLinear, type RGB } from '../../lib/colormaps';
import { ZONES } from '../../lib/severity';
import { HALF, type WaterfallModel } from './model';

/** Zone colours for the alarm/shutdown highlight and planes: the fixed status
 *  palette, the same in both themes. */
export const ALARM_HEX = ZONES.alarm.hex;
export const SHUTDOWN_HEX = ZONES.shutdown.hex;

/** Vertex positions: xyz per vertex, row-major (row = speed, column =
 *  frequency bin). Redone when the model changes (data, scale or height);
 *  the colours are apart, so a new height moves the vertices only. */
export function surfacePositions(model: WaterfallModel): Float32Array {
  const { nRows, nBins, rows, rowZ } = model;
  const positions = new Float32Array(nRows * nBins * 3);
  // Columns sit at even steps, matching `heightAt`/`pickSurface`; the
  // frequency axis is evenly spaced, so this equals xOfFreq(freq[b]).
  const xs = model.freq.map((_, b) => model.xOfBin(b));
  for (let r = 0; r < nRows; r++) {
    const row = rows[r];
    const z = rowZ[r];
    for (let b = 0; b < nBins; b++) {
      const i = (r * nBins + b) * 3;
      positions[i] = xs[b];
      positions[i + 1] = model.yOfAmp(row[b] ?? 0);
      positions[i + 2] = z;
    }
  }
  return positions;
}

/** Vertex colours, linear-light rgb 0–1 in the order of the positions.
 *  Redone when the data, the colour scale, the highlight or the colour
 *  scheme changes, not with the height. `colour` maps a position on the
 *  colour scale (colourUnit: 0 … 1) to rgb; with a highlight, amplitudes
 *  from the alarm or shutdown level up are tinted toward that zone's colour.
 *  three.js takes vertex colours as linear light and encodes to sRGB on
 *  output, so `colour` must be a scheme's linear sampler: given the sRGB
 *  stops, the surface would come out lighter and paler than its legend. */
export function surfaceColours(
  model: Pick<WaterfallModel, 'nRows' | 'nBins' | 'rows' | 'colourUnit'>,
  highlight: { alarm: number; shutdown: number } | null,
  colour: (t: number) => RGB = colormap(DEFAULT_COLORMAP, 'dark', 'linear'),
): Float32Array {
  const { nRows, nBins, rows } = model;
  const colors = new Float32Array(nRows * nBins * 3);
  // The tints mix in linear light as well, like every blend the renderer does.
  const alarm = hexToRgb(ALARM_HEX).map(srgbToLinear);
  const shutdown = hexToRgb(SHUTDOWN_HEX).map(srgbToLinear);

  for (let r = 0; r < nRows; r++) {
    const row = rows[r];
    for (let b = 0; b < nBins; b++) {
      const i = (r * nBins + b) * 3;
      const a = row[b] ?? 0;
      let [cr, cg, cb] = colour(model.colourUnit(a));
      if (highlight && a >= highlight.alarm) {
        const tint = a >= highlight.shutdown ? shutdown : alarm;
        const k = a >= highlight.shutdown ? 0.85 : 0.65;
        cr = cr * (1 - k) + tint[0] * k;
        cg = cg * (1 - k) + tint[1] * k;
        cb = cb * (1 - k) + tint[2] * k;
      }
      colors[i] = cr;
      colors[i + 1] = cg;
      colors[i + 2] = cb;
    }
  }
  return colors;
}

/** Triangle indices for an nRows × nBins grid. Depends only on the shape,
 *  so the surface keeps it while the shape stays (SurfaceMesh.tsx). Two
 *  triangles per cell, wound so their front faces point down (-y): the
 *  surface material draws both sides. */
export function buildGridIndex(nRows: number, nBins: number): THREE.BufferAttribute {
  const quads = Math.max(0, nRows - 1) * Math.max(0, nBins - 1);
  const index = new Uint32Array(quads * 6);
  let k = 0;
  for (let r = 0; r < nRows - 1; r++) {
    for (let b = 0; b < nBins - 1; b++) {
      const a = r * nBins + b;
      const c = a + nBins;
      index[k++] = a;
      index[k++] = c;
      index[k++] = a + 1;
      index[k++] = a + 1;
      index[k++] = c;
      index[k++] = c + 1;
    }
  }
  return new THREE.BufferAttribute(index, 1);
}

/** Surface height (world y) at world (x, z), bilinear between grid vertices. */
function heightAt(model: WaterfallModel, positions: Float32Array, x: number, z: number): number {
  const { nBins, nRows } = model;
  const bf = ((x + HALF) / (2 * HALF)) * (nBins - 1);
  const b0 = Math.max(0, Math.min(nBins - 1, Math.floor(bf)));
  const b1 = Math.min(nBins - 1, b0 + 1);
  const fb = Math.max(0, Math.min(1, bf - b0));
  const rf = model.rowAtZ(z);
  const r0 = Math.floor(rf);
  const r1 = Math.min(nRows - 1, r0 + 1);
  const fr = rf - r0;
  const y = (r: number, b: number) => positions[(r * nBins + b) * 3 + 1];
  const h0 = y(r0, b0) + (y(r0, b1) - y(r0, b0)) * fb;
  const h1 = y(r1, b0) + (y(r1, b1) - y(r1, b0)) * fb;
  return h0 + (h1 - h0) * fr;
}

/**
 * First point where `ray` meets the surface, as grid indices.
 *
 * Marches the ray through the surface's bounding box in steps finer than one
 * grid cell and bisects the first crossing. Exact for a height field, and
 * ~1k cheap samples instead of a triangle-by-triangle raycast (200k+).
 */
export function pickSurface(
  model: WaterfallModel,
  positions: Float32Array,
  ray: THREE.Ray,
): { row: number; bin: number } | null {
  if (model.nRows < 2 || model.nBins < 2) return null;
  // Slightly above the tallest possible vertex, so the box holds the surface.
  const top = model.height * 1.001 + 1e-4;
  const span = slab(ray, [-HALF, 0, -HALF], [HALF, top, HALF]);
  if (!span) return null;
  const [t0, t1] = span;

  const cell = (2 * HALF) / Math.max(model.nBins, model.nRows);
  const steps = Math.min(6000, Math.max(8, Math.ceil((t1 - t0) / (cell * 0.5))));
  const o = ray.origin;
  const d = ray.direction;
  const below = (t: number) => {
    const x = o.x + d.x * t;
    const z = o.z + d.z * t;
    return o.y + d.y * t <= heightAt(model, positions, x, z);
  };

  let prev = t0;
  for (let i = 1; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    if (below(t)) {
      let lo = prev;
      let hi = t;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      const x = o.x + d.x * hi;
      const z = o.z + d.z * hi;
      return {
        bin: Math.max(
          0,
          Math.min(model.nBins - 1, Math.round(((x + HALF) / (2 * HALF)) * (model.nBins - 1))),
        ),
        row: Math.max(0, Math.min(model.nRows - 1, Math.round(model.rowAtZ(z)))),
      };
    }
    prev = t;
  }
  return null;
}

/** Ray/axis-aligned-box intersection interval, clipped to t ≥ 0. */
function slab(ray: THREE.Ray, min: number[], max: number[]): [number, number] | null {
  let t0 = 0;
  let t1 = Infinity;
  const o = [ray.origin.x, ray.origin.y, ray.origin.z];
  const d = [ray.direction.x, ray.direction.y, ray.direction.z];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    let a = (min[k] - o[k]) / d[k];
    let b = (max[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}
