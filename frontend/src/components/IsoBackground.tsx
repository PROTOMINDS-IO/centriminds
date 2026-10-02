// Animated isometric backdrop of the sign-in and sign-up pages: a grid of
// columns whose heights pulse in a wave, coloured with the surface colour
// scheme (lib/colormaps.ts, the same one the waterfall uses), viewed through
// an orthographic camera at the canonical 30° dimetric angle.
//
// WebGL cannot read the CSS tokens, so the lighting and the fog (which fades
// the far columns into the page) come from a palette per theme.
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { useColormap } from '../hooks/useColormap';
import { prefersReducedMotion } from '../lib/motion';
import { useResolvedTheme, type ResolvedTheme } from '../lib/theme';

interface ScenePalette {
  /** About the page colour behind the canvas, so far columns fade into it. */
  fog: string;
  fogDensity: number;
  emissive: string;
  emissiveIntensity: number;
  ambient: number;
  /** Intensity of the key light, the main directional light. */
  key: number;
  /** Tint of the fill light, a weaker directional light from the far side. */
  fill: string;
  fillIntensity: number;
}

const PALETTES: Record<ResolvedTheme, ScenePalette> = {
  dark: {
    fog: '#06080f',
    fogDensity: 0.04,
    emissive: '#0c1024',
    emissiveIntensity: 0.5,
    ambient: 0.6,
    key: 0.8,
    fill: '#7dd3fc',
    fillIntensity: 0.35,
  },
  // Light page: fade into it rather than into black, and light the columns
  // brighter with no dark-blue glow, so they read as soft colour on paper.
  light: {
    fog: '#eef0f3',
    fogDensity: 0.03,
    emissive: '#000000',
    emissiveIntensity: 0,
    ambient: 0.95,
    key: 0.9,
    fill: '#e0f2fe',
    fillIntensity: 0.4,
  },
};

/** Grid resolution (N×N columns): plenty for a smooth wave. */
const SIZE = 24;
/** Spacing between columns in world units. */
const SPACING = 0.55;
/** Maximum column height. */
const AMPLITUDE = 1.6;
/** Wave speed. */
const SPEED = 0.35;
const COUNT = SIZE * SIZE;

/** Static instance positions; only height + colour change per frame. */
const POSITIONS = (() => {
  const arr: { x: number; z: number; phase: number }[] = [];
  const half = (SIZE - 1) / 2;
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      const x = (i - half) * SPACING;
      const z = (j - half) * SPACING;
      const r = Math.hypot(x, z);
      arr.push({ x, z, phase: r * 0.7 });
    }
  }
  return arr;
})();

function Field({ palette }: { palette: ScenePalette }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const colour = useColormap();

  useFrame((state) => {
    const t = state.clock.elapsedTime * SPEED;
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < COUNT; i++) {
      const p = POSITIONS[i];
      // Concentric ripples from the centre plus two plane waves across the
      // grid. The weights sum to 1, so `wave` stays in [-1, 1]; the 0.05
      // below keeps the lowest columns visible.
      const wave =
        Math.sin(p.phase - t * 1.5) * 0.55 +
        Math.sin(p.x * 0.7 + t) * 0.25 +
        Math.cos(p.z * 0.7 - t * 0.7) * 0.2;
      const h = ((wave + 1) / 2) * AMPLITUDE + 0.05;
      dummy.position.set(p.x, h / 2, p.z);
      dummy.scale.set(0.32, h, 0.32);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const [r, g, b] = colour(h / AMPLITUDE);
      // Scheme colours are sRGB; setRGB converts them to three.js's linear
      // working colour space.
      mesh.setColorAt(i, tmpColor.setRGB(r, g, b, THREE.SRGBColorSpace));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      castShadow={false}
      receiveShadow={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        roughness={0.45}
        metalness={0.2}
        emissive={palette.emissive}
        emissiveIntensity={palette.emissiveIntensity}
      />
    </instancedMesh>
  );
}

function IsoCamera() {
  // 30° dimetric "isometric-ish" framing.
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(14, 12, 14);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

interface IsoBackgroundProps {
  /** Opacity of the whole backdrop, 0–1. */
  intensity?: number;
}

export default function IsoBackground({ intensity = 1 }: IsoBackgroundProps) {
  const palette = PALETTES[useResolvedTheme()];
  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: intensity }}>
      <Canvas
        // AuthShell leaves the backdrop out under reduced motion; should the
        // preference change once it is up, it draws one still frame.
        frameloop={prefersReducedMotion() ? 'demand' : 'always'}
        // Capped at 1.5× on high-density screens: a backdrop is not worth
        // the GPU time of full resolution.
        dpr={[1, 1.5]}
        orthographic
        camera={{ zoom: 38, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <IsoCamera />
        <ambientLight intensity={palette.ambient} />
        <directionalLight position={[10, 12, 5]} intensity={palette.key} />
        <directionalLight
          position={[-8, 6, -4]}
          intensity={palette.fillIntensity}
          color={palette.fill}
        />
        <Field palette={palette} />
        <fogExp2 attach="fog" args={[palette.fog, palette.fogDensity]} />
      </Canvas>
    </div>
  );
}
