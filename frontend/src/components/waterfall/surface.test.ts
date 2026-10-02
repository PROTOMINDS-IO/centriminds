import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { COLORMAP_STOPS, colormap } from '../../lib/colormaps';
import { buildModel, type WaterfallModel } from './model';
import { coastDown } from './testData';
import {
  ALARM_HEX,
  SHUTDOWN_HEX,
  buildGridIndex,
  pickSurface,
  surfaceColours,
  surfacePositions,
} from './surface';

function rayAt(
  from: THREE.Vector3,
  model: WaterfallModel,
  positions: Float32Array,
  row: number,
  bin: number,
) {
  const i = (row * model.nBins + bin) * 3;
  const target = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
  return new THREE.Ray(from.clone(), target.sub(from).normalize());
}

describe('pickSurface', () => {
  const model = buildModel(coastDown(12, 16), { scale: 'linear', height: 1, rpmFilter: null });
  const positions = surfacePositions(model);

  it.each([
    ['perspective view', new THREE.Vector3(2.6, 2.0, 2.6)],
    ['top view', new THREE.Vector3(0, 3.15, 0.0001)],
    ['view from the left', new THREE.Vector3(-2.8, 1.5, 0.4)],
  ])('returns the cell the pointer is on (%s)', (_name, camera) => {
    for (const [row, bin] of [
      [0, 0],
      [11, 15],
      [3, 12],
      [8, 2],
      [6, 7],
    ] as const) {
      expect(pickSurface(model, positions, rayAt(camera, model, positions, row, bin))).toEqual({
        row,
        bin,
      });
    }
  });

  it('reads the row the pointer moved to, not its mirror image', () => {
    const camera = new THREE.Vector3(2.6, 2.0, 2.6);
    const front = pickSurface(model, positions, rayAt(camera, model, positions, 1, 8))!;
    const back = pickSurface(model, positions, rayAt(camera, model, positions, 10, 8))!;
    // Front of the surface = slow speeds, back = fast speeds.
    expect(model.rpm[front.row]).toBeLessThan(model.rpm[back.row]);
  });

  it('lets a tall peak hide what is behind it', () => {
    const tall = buildModel(coastDown(12, 16, { row: 6, bin: 8, amp: 50 }), {
      scale: 'linear',
      height: 1,
      rpmFilter: null,
    });
    // The peak sits at file row 6 (1500 rpm); find its row in the model.
    const peakRow = tall.rpm.indexOf(1500);
    const arr = surfacePositions(tall);
    const camera = new THREE.Vector3(0, 0.4, 3); // low, in front
    // Aim at the far edge behind the peak: the ray must stop on the peak (its
    // front slope spans the row before it), never reach the cell behind.
    const hit = pickSurface(tall, arr, rayAt(camera, tall, arr, tall.nRows - 1, 8))!;
    expect(hit.bin).toBe(8);
    expect([peakRow - 1, peakRow]).toContain(hit.row);
  });

  it('returns null when the pointer misses the surface', () => {
    const ray = new THREE.Ray(new THREE.Vector3(5, 5, 5), new THREE.Vector3(1, 0, 0));
    expect(pickSurface(model, positions, ray)).toBeNull();
  });
});

describe('surfaceColours', () => {
  /** A coast-down at zero vibration but for the given amplitudes (file row,
   *  bin → mm/s). */
  function quietBut(peaks: [row: number, bin: number, amp: number][]) {
    const spec = coastDown(6, 8);
    spec.z_matrix = spec.z_matrix.map((row) => row.map(() => 0));
    for (const [row, bin, amp] of peaks) spec.z_matrix[row][bin] = amp;
    const model = buildModel(spec, { scale: 'linear', height: 1, rpmFilter: null });
    // Model rows run by speed; coastDown's file row r is at 3000 - 250 r rpm.
    const at = (colors: Float32Array, row: number, bin: number) => {
      const i = (model.rpm.indexOf(3000 - 250 * row) * model.nBins + bin) * 3;
      return [colors[i], colors[i + 1], colors[i + 2]];
    };
    return { model, at };
  }

  /** A '#rrggbb' colour as three.js decodes it into its linear working space. */
  const inThree = (hex: string) => {
    const c = new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
    return [c.r, c.g, c.b];
  };
  const close = (rgb: number[]) => rgb.map((v) => expect.closeTo(v, 5));

  it('paints each vertex from the colour scheme it is given', () => {
    const model = buildModel(coastDown(6, 8), { scale: 'linear', height: 1, rpmFilter: null });
    const sample = colormap('ocean', 'light', 'linear');
    const colors = surfaceColours(model, null, sample);
    for (let r = 0; r < model.nRows; r++) {
      for (let b = 0; b < model.nBins; b++) {
        const i = (r * model.nBins + b) * 3;
        const expected = sample(model.unit(model.rows[r][b] ?? 0));
        expect([colors[i], colors[i + 1], colors[i + 2]]).toEqual(close(expected));
      }
    }
  });

  it("hands three.js the legend's colours in linear light", () => {
    // three.js reads vertex colours as linear and encodes to sRGB on output:
    // the floor has to arrive as the scheme's first stop decoded, the maximum
    // as its last, or the surface renders paler than the legend.
    const { model, at } = quietBut([[2, 5, 9]]);
    const colors = surfaceColours(model, null); // Viridis, dark theme
    const stops = COLORMAP_STOPS.viridis.dark;
    expect(at(colors, 0, 0)).toEqual(close(inThree(stops[0])));
    expect(at(colors, 2, 5)).toEqual(close(inThree(stops[stops.length - 1])));
  });

  it('tints alarm and shutdown amplitudes toward the zone colours, in linear light', () => {
    const { model, at } = quietBut([
      [1, 3, 5], // alarm (≥ 4) but below shutdown
      [4, 6, 9], // shutdown (≥ 7)
    ]);
    const sample = colormap('graphite', 'light', 'linear');
    const colors = surfaceColours(model, { alarm: 4, shutdown: 7 }, sample);
    const scheme = (amp: number) => sample(model.colourUnit(amp));
    const mix = (a: number[], b: number[], k: number) => close(a.map((v, c) => v + (b[c] - v) * k));
    expect(at(colors, 1, 3)).toEqual(mix(scheme(5), inThree(ALARM_HEX), 0.65));
    expect(at(colors, 4, 6)).toEqual(mix(scheme(9), inThree(SHUTDOWN_HEX), 0.85));
    // Below the alarm level the scheme's colour is left alone.
    expect(at(colors, 0, 0)).toEqual(close(scheme(0)));
  });
});

describe('surfacePositions', () => {
  it('places every vertex where the model puts its reading', () => {
    const model = buildModel(coastDown(6, 8, { row: 2, bin: 3, amp: 9 }), {
      scale: 'log',
      height: 1.5,
      rpmFilter: null,
    });
    const positions = surfacePositions(model);
    for (let r = 0; r < model.nRows; r++) {
      for (let b = 0; b < model.nBins; b++) {
        const i = (r * model.nBins + b) * 3;
        expect(positions[i]).toBeCloseTo(model.xOfFreq(model.freq[b]), 6);
        expect(positions[i + 1]).toBeCloseTo(model.yOfAmp(model.rows[r][b]), 6);
        expect(positions[i + 2]).toBeCloseTo(model.rowZ[r], 6);
      }
    }
  });
});

describe('buildGridIndex', () => {
  it('covers every cell with two triangles', () => {
    const index = buildGridIndex(3, 4);
    expect(index.count).toBe(2 * 3 * 6);
    expect(Math.max(...(index.array as Uint32Array))).toBe(3 * 4 - 1);
  });
});
