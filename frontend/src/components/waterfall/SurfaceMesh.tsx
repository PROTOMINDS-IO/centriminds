// The waterfall surface itself and the classic line waterfall drawn on it.
//
// The surface keeps one geometry while the grid's shape stays: its triangle
// indices (~600k for a full preview) depend on the shape alone, and the
// positions and colours arrive apart (surface.ts) and are written into the
// existing attributes. So the height slider only moves the vertices and a
// new colour scheme only recolours them.
import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { useUIStore } from '../../store/uiStore';
import type { WaterfallModel } from './model';
import { useScenePalette } from './palette';
import { buildGridIndex } from './surface';

export function Surface({
  nRows,
  nBins,
  positions,
  colors,
  lit,
}: {
  nRows: number;
  nBins: number;
  /** xyz per vertex (surfacePositions). */
  positions: Float32Array;
  /** Linear rgb per vertex (surfaceColours). */
  colors: Float32Array;
  /** Shaded by the scene's lights (perspective); unlit for the top view. */
  lit: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const size = nRows * nBins * 3;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(size), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(size), 3));
    g.setIndex(buildGridIndex(nRows, nBins));
    return g;
  }, [nRows, nBins]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Written before the frame is drawn; on-demand rendering needs to be told.
  useLayoutEffect(() => {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.copyArray(positions);
    attr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    invalidate();
  }, [geometry, positions, invalidate]);
  useLayoutEffect(() => {
    const attr = geometry.getAttribute('color') as THREE.BufferAttribute;
    attr.copyArray(colors);
    attr.needsUpdate = true;
    invalidate();
  }, [geometry, colors, invalidate]);

  // Lit, it is matt (Lambert), so the lights alone set how bright a patch is
  // and an upward-facing one shows the legend's colours (palette.ts
  // `lights`). A shiny material's highlight would grey the dark floors
  // wherever the camera catches a light's reflection. The top view is a
  // colour plan and unlit, every patch in the legend's colour: its flattened
  // surface still has slopes (a step from zero to the maximum between two
  // of 512 bins tilts it by about 14°), which light would shade.
  //
  // Both sides: the triangles face down (buildGridIndex), so the camera
  // above sees their backs; three.js flips the normals to match.
  return (
    <mesh geometry={geometry}>
      {lit ? (
        <meshLambertMaterial vertexColors side={THREE.DoubleSide} />
      ) : (
        <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
      )}
    </mesh>
  );
}

/** Classic line waterfall: the spectrum of every n-th speed, drawn on the surface. */
export function SpectrumLines({
  model,
  positions,
}: {
  model: WaterfallModel;
  positions: Float32Array;
}) {
  const palette = useScenePalette();
  const show = useUIStore((s) => s.showSpectrumLines);
  const geometry = useMemo(() => {
    if (!show || model.nRows < 2 || model.nBins < 2) return null;
    // About 36 lines, whatever the number of speeds.
    const stride = Math.max(1, Math.round(model.nRows / 36));
    const rows: number[] = [];
    for (let r = 0; r < model.nRows; r += stride) rows.push(r);
    const out = new Float32Array(rows.length * (model.nBins - 1) * 6);
    let k = 0;
    for (const r of rows) {
      for (let b = 0; b < model.nBins - 1; b++) {
        for (const bb of [b, b + 1]) {
          const i = (r * model.nBins + bb) * 3;
          out[k++] = positions[i];
          // Just above the surface, below the hovered row's line.
          out[k++] = positions[i + 1] + 0.004;
          out[k++] = positions[i + 2];
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    return g;
  }, [show, model, positions]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={palette.spectrumLines}
        transparent
        opacity={palette.spectrumLinesOpacity}
      />
    </lineSegments>
  );
}
