// Drawing parts shared by the 3D scene's layers: labels, a line at one
// frequency or speed, a frequency band, and a line laid on the surface.
// All positions come from the WaterfallModel (model.ts).
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Billboard, Line, Text } from '@react-three/drei';
import * as THREE from 'three';

import { useUIStore } from '../../store/uiStore';
import { HALF, type WaterfallModel } from './model';
import { useScenePalette } from './palette';

/** Self-hosted (public/fonts) — without it the text library fetches fonts from a CDN. */
const FONT = '/fonts/inter-labels.woff';

type Vec3 = [number, number, number];

/** Text in the scene: faces the camera, outlined in the palette's halo so it
 *  reads over the surface. `size` is in world units. */
export function Label({
  position,
  children,
  color,
  size = 0.055,
  anchorX = 'center',
  anchorY = 'middle',
}: {
  position: Vec3;
  children: string;
  /** Defaults to the palette's label colour. */
  color?: string;
  size?: number;
  anchorX?: 'left' | 'center' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom';
}) {
  const palette = useScenePalette();
  // Appearing after the font resolves is a change on-demand rendering must see.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [invalidate]);
  return (
    <Billboard position={position}>
      <Text
        font={FONT}
        fontSize={size}
        color={color ?? palette.text}
        anchorX={anchorX}
        anchorY={anchorY}
        outlineColor={palette.halo}
        outlineWidth={size * 0.08}
      >
        {children}
      </Text>
    </Billboard>
  );
}

/** A frame at one frequency across all speeds, with its label; dashed for
 *  lines that are not the machine's (the mains). */
export function FrequencyLine({
  model,
  freqHz,
  color,
  label,
  dashed = false,
}: {
  model: WaterfallModel;
  freqHz: number;
  color: string;
  label: string;
  dashed?: boolean;
}) {
  const x = model.xOfFreq(freqHz);
  if (x < -HALF || x > HALF) return null;
  const h = model.height;
  return (
    <group>
      <Line
        points={[
          [x, 0, -HALF],
          [x, h, -HALF],
          [x, h, HALF],
          [x, 0, HALF],
          [x, 0, -HALF],
        ]}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.9}
        dashed={dashed}
        dashSize={0.04}
        gapSize={0.03}
      />
      <Label position={[x, h + 0.07, -HALF]} anchorY="bottom" color={color} size={0.05}>
        {label}
      </Label>
    </group>
  );
}

/** A line at one speed across all frequencies, on a faint plane. */
export function SpeedLine({
  model,
  rpm,
  color,
  label,
}: {
  model: WaterfallModel;
  rpm: number;
  color: string;
  label: string;
}) {
  if (rpm < model.rpmMin || rpm > model.rpmMax) return null;
  const z = model.zOfRpm(rpm);
  return (
    <group>
      <Line
        points={[
          [-HALF, 0.002, z],
          [HALF, 0.002, z],
        ]}
        color={color}
        lineWidth={1.4}
      />
      <mesh position={[0, model.height / 2, z]} renderOrder={3}>
        <planeGeometry args={[2 * HALF, model.height]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Label position={[HALF + 0.05, 0.02, z]} anchorX="left" color={color} size={0.05}>
        {label}
      </Label>
    </group>
  );
}

/** Where a crowded label goes to make room: up in perspective, and in the
 *  top view (looking down, where up is toward the camera) along the screen. */
function useLift(lift: number): Vec3 {
  const top = useUIStore((s) => s.viewMode) === 'top';
  return top ? [0, 0, -lift] : [0, lift, 0];
}

/**
 * A frequency band, over a speed range (all speeds by default): shaded and
 * outlined on the floor, as a hand-marked waterfall has it, with a faint
 * volume above so it reads in perspective too; labelled on the floor at its
 * slow end (where the order lines' names are not), `labelLift` further in
 * where labels crowd. `dashed` for zones known beforehand rather than
 * found in this sweep.
 */
export function Band({
  model,
  loHz,
  hiHz,
  rpmLo,
  rpmHi,
  color,
  label,
  opacity = 0.2,
  dashed = false,
  labelLift = 0,
}: {
  model: WaterfallModel;
  loHz: number;
  hiHz: number;
  rpmLo?: number | null;
  rpmHi?: number | null;
  color: string;
  label: string;
  /** Of the floor shading; the volume above is a sixth of it. */
  opacity?: number;
  dashed?: boolean;
  labelLift?: number;
}) {
  const [, ly, lz] = useLift(labelLift);
  const x0 = Math.max(-HALF, model.xOfFreq(loHz));
  const x1 = Math.min(HALF, model.xOfFreq(hiHz));
  const lo = Math.max(model.rpmMin, rpmLo ?? model.rpmMin);
  const hi = Math.min(model.rpmMax, rpmHi ?? model.rpmMax);
  if (x1 <= x0 || hi < lo) return null;
  // A single-speed measurement lays every speed at z = 0: span the floor.
  const zBack = hi > lo ? model.zOfRpm(hi) : -HALF;
  const zFront = hi > lo ? model.zOfRpm(lo) : HALF;
  const h = model.height;
  const cx = (x0 + x1) / 2;
  const cz = (zBack + zFront) / 2;
  return (
    <group>
      <mesh position={[cx, 0.002, cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
        <planeGeometry args={[x1 - x0, zFront - zBack]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <mesh position={[cx, h / 2, cz]} renderOrder={2}>
        <boxGeometry args={[x1 - x0, h, zFront - zBack]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity / 6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={[
          [x0, 0.003, zBack],
          [x1, 0.003, zBack],
          [x1, 0.003, zFront],
          [x0, 0.003, zFront],
          [x0, 0.003, zBack],
        ]}
        color={color}
        lineWidth={1.1}
        transparent
        opacity={0.85}
        dashed={dashed}
        dashSize={0.04}
        gapSize={0.03}
      />
      <Label
        position={[cx, 0.02 + ly, zFront - 0.12 + lz]}
        anchorY="bottom"
        color={color}
        size={0.045}
      >
        {label}
      </Label>
    </group>
  );
}

/** Polylines on the surface (overlays.surfacePath), labelled at the end of
 *  the last one: the fast end, where a waterfall's order lines are named;
 *  `labelLift` higher where labels crowd. */
export function SurfacePath({
  segments,
  color,
  label,
  dashed = false,
  width = 1.6,
  opacity = 1,
  labelLift = 0,
}: {
  segments: Vec3[][];
  color: string;
  label?: string;
  dashed?: boolean;
  width?: number;
  opacity?: number;
  labelLift?: number;
}) {
  const [, ly, lz] = useLift(labelLift);
  if (segments.length === 0) return null;
  const last = segments[segments.length - 1];
  const end = last[last.length - 1];
  return (
    <group>
      {segments.map((points, i) => (
        <Line
          key={i}
          points={points}
          color={color}
          lineWidth={width}
          transparent={opacity < 1}
          opacity={opacity}
          dashed={dashed}
          dashSize={0.035}
          gapSize={0.025}
        />
      ))}
      {label && (
        <Label
          position={[end[0], end[1] + 0.05 + ly, end[2] - 0.02 + lz]}
          anchorY="bottom"
          color={color}
          size={0.045}
        >
          {label}
        </Label>
      )}
    </group>
  );
}
