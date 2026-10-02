// The camera of the 3D waterfall: orbit controls, the flight between the
// perspective and the top view, the lens that frames the surface in the
// room the cards leave (framing.ts), and the slow orbit of an idle view.
import { useEffect, useRef } from 'react';
import type { ComponentRef, RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import { prefersReducedMotion } from '../../lib/motion';
import { useAutoRotate } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { VIEW_3D, VIEW_TOP, frameView, type Framing, type Insets } from './framing';

/** The controls instance behind drei's <OrbitControls> (its ref). */
type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

/** Quiet time before the view starts to orbit by itself. */
const IDLE_MS = 8000;

/**
 * Orbit slowly while nobody interacts with the view; pointer, wheel or touch
 * input on the canvas stops it at once and restarts the idle timer. Drives
 * the controls directly (no React state), requesting frames only while
 * rotating, so an idle view costs nothing when the option is off.
 */
function useIdleAutoRotate(ref: RefObject<OrbitControlsImpl | null>, enabled: boolean) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    if (!enabled) {
      controls.autoRotate = false;
      return;
    }
    const el = gl.domElement;
    let timer = 0;
    let raf = 0;
    const frame = () => {
      invalidate();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
      raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      controls.autoRotate = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      timer = window.setTimeout(start, IDLE_MS);
    };
    wake();
    const events = ['pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;
    for (const e of events) el.addEventListener(e, wake, { passive: true });
    controls.addEventListener('start', wake);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      controls.autoRotate = false;
      for (const e of events) el.removeEventListener(e, wake);
      controls.removeEventListener('start', wake);
    };
  }, [enabled, gl, invalidate, ref]);
}

/** Camera flight between viewpoints (view switch, "Reset view"). */
interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  /** Progress, 0 → 1. */
  t: number;
}
/** Duration of a flight (s). */
const FLIGHT_S = 0.6;
/** How fast the lens eases to a new framing (1/s): settled in ~0.3 s. */
const LENS_RATE = 14;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function CameraRig({ inset }: { inset: Insets }) {
  const ref = useRef<OrbitControlsImpl | null>(null);
  const viewMode = useUIStore((s) => s.viewMode);
  const autoRotate = useAutoRotate();
  useIdleAutoRotate(ref, autoRotate && viewMode === '3d');
  const resetSignal = useUIStore((s) => s.cameraResetSignal);
  const { size, invalidate, get } = useThree();
  const view = viewMode === 'top' ? VIEW_TOP : VIEW_3D;

  // View switch and "Reset view" fly the camera to the new viewpoint (it
  // is placed directly on first load and under reduced motion). A drag
  // takes over from a flight in progress.
  const flight = useRef<Flight | null>(null);
  const placed = useRef(false);
  useEffect(() => {
    // three.js objects are mutable by design; read the live camera from the store.
    const cam = get().camera;
    const controls = ref.current;
    const to = new THREE.Vector3(...view.position);
    const toTarget = new THREE.Vector3(...view.target);
    if (!placed.current || !controls || prefersReducedMotion()) {
      placed.current = true;
      flight.current = null;
      cam.position.copy(to);
      controls?.target.copy(toTarget);
      controls?.update();
    } else {
      flight.current = {
        from: cam.position.clone(),
        to,
        fromTarget: controls.target.clone(),
        toTarget,
        t: 0,
      };
    }
    invalidate();
  }, [view, resetSignal, get, invalidate]);
  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const land = () => {
      flight.current = null;
    };
    controls.addEventListener('start', land);
    return () => controls.removeEventListener('start', land);
  }, []);

  // The lens frames the surface for the pane's shape, centred in the room
  // the expanded cards leave (framing.ts), and eases to a new framing when a
  // card opens or closes instead of jumping.
  const goal = frameView(size.width, size.height, inset);
  const lens = useRef<(Framing & { width: number; height: number }) | null>(null);
  // A new goal needs a frame to start easing toward it.
  useEffect(() => invalidate(), [goal.zoom, goal.shift, invalidate]);

  useFrame((_, dt) => {
    const cam = get().camera as THREE.PerspectiveCamera;
    let moving = false;

    const f = flight.current;
    if (f && ref.current) {
      f.t = Math.min(1, f.t + dt / FLIGHT_S);
      const e = easeInOutCubic(f.t);
      cam.position.lerpVectors(f.from, f.to, e);
      ref.current.target.lerpVectors(f.fromTarget, f.toTarget, e);
      ref.current.update();
      if (f.t < 1) moving = true;
      else flight.current = null;
    }

    const cur = lens.current;
    // Exponential approach: the same pace at any frame rate.
    const k = !cur || prefersReducedMotion() ? 1 : 1 - Math.exp(-dt * LENS_RATE);
    let zoom = cur ? cur.zoom + (goal.zoom - cur.zoom) * k : goal.zoom;
    let shift = cur ? cur.shift + (goal.shift - cur.shift) * k : goal.shift;
    // What is left (under 1e-4 zoom and a quarter pixel) cannot be seen:
    // land on the goal so the frames stop.
    if (Math.abs(goal.zoom - zoom) < 1e-4 && Math.abs(goal.shift - shift) < 0.25) {
      zoom = goal.zoom;
      shift = goal.shift;
    } else {
      moving = true;
    }
    const { width, height } = size;
    if (
      !cur ||
      zoom !== cur.zoom ||
      shift !== cur.shift ||
      width !== cur.width ||
      height !== cur.height
    ) {
      cam.zoom = zoom;
      // The view window moves against the picture: -shift moves it right.
      if (shift) cam.setViewOffset(width, height, -shift, 0, width, height);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
      lens.current = { zoom, shift, width, height };
    }

    if (moving) invalidate();
  });

  const top = viewMode === 'top';
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      enableRotate={!top}
      minDistance={0.8}
      maxDistance={9}
      // Stop just short of level (π/2): never a view from below.
      maxPolarAngle={Math.PI / 2.05}
      mouseButtons={
        top
          ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
          : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      }
      touches={
        top
          ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
          : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
      }
    />
  );
}
