// 3D waterfall of a speed sweep: frequency × speed × amplitude.
//
// Every layer positions itself through one WaterfallModel (see model.ts), so
// the surface, the pointer picking and all overlays agree by construction.
// The model is built in three steps, each kept until its own inputs change:
// the data (filters), the amplitude scale and the height. The layers are in
// their own modules: the surface (SurfaceMesh.tsx), the axes and level planes
// (Axes.tsx), the hover marker (HoverLayer.tsx), the camera (CameraRig.tsx),
// and the analysis's layers and the user's annotations (AnalysisLayers.tsx).
// The canvas renders on demand — only when the camera, the data or a layer
// changes — instead of 60 times a second. Colours come from the palette of
// the current theme (palette.ts) and every label from the dictionaries, so
// switching either redraws the scene.
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { AnnotationRead, PhysicsResults, SpectrogramRead } from '../../api/types';
import { useColormap } from '../../hooks/useColormap';
import { useI18n } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { useUIStore } from '../../store/uiStore';
import { AnalysisLayers } from './AnalysisLayers';
import { Axes, ThresholdPlanes } from './Axes';
import { CameraRig } from './CameraRig';
import { NO_INSETS, VIEW_3D, type Insets } from './framing';
import { hoverAt, useHoverStore } from './hover';
import { HoverLayer } from './HoverLayer';
import { useLegendStore } from './legend';
import { ampScale, buildData, placeModel, type WaterfallModel } from './model';
import { LIGHT_POSITIONS, useScenePalette } from './palette';
import { pickSurface, surfaceColours, surfacePositions } from './surface';
import { SpectrumLines, Surface } from './SurfaceMesh';

interface Props {
  spectrogram: SpectrogramRead;
  physics?: PhysicsResults;
  /** The user's saved annotations. */
  annotations?: AnnotationRead[];
  /** Room covered by expanded cards; the surface centres in what is left. */
  inset?: Insets;
  /** Name of the image "Save image" downloads (without .png). */
  imageName?: string;
}

const NO_ANNOTATIONS: AnnotationRead[] = [];

export default function Waterfall3D({
  spectrogram,
  physics,
  annotations = NO_ANNOTATIONS,
  inset = NO_INSETS,
  imageName = 'waterfall',
}: Props) {
  const { t } = useI18n();
  return (
    <div className="absolute inset-0 bg-ink-900" role="img" aria-label={t('workspace.scene.label')}>
      {/* flat: no tone mapping, so the surface shows the colour scheme's
          own colours (as in the picker) and the palette's tested contrasts
          hold on screen. */}
      <Canvas
        flat
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [...VIEW_3D.position], fov: 45 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Scene
          spectrogram={spectrogram}
          physics={physics}
          annotations={annotations}
          inset={inset}
          imageName={imageName}
        />
      </Canvas>
    </div>
  );
}

function Scene({
  spectrogram,
  physics,
  annotations,
  inset,
  imageName,
}: Props & { inset: Insets; annotations: AnnotationRead[]; imageName: string }) {
  const scale = useUIStore((s) => s.ampScaleMode);
  const height = useUIStore((s) => s.heightScale);
  const rpmFilter = useUIStore((s) => s.rpmFilter);
  const freqFilter = useUIStore((s) => s.freqFilter);
  const highlightOn = useUIStore((s) => s.showThresholdHighlight);
  const alarm = useUIStore((s) => s.alarmMmS);
  const shutdown = useUIStore((s) => s.shutdownMmS);
  const top = useUIStore((s) => s.viewMode) === 'top';
  const spread = useSettingsStore((s) => s.colour_spread);

  // Slicing and sorting the matrix is the costly step: only the data and
  // the filters redo it. The scale and the height are cheap on top.
  const data = useMemo(
    () => buildData(spectrogram, { rpmFilter, freqFilter }),
    [spectrogram, rpmFilter, freqFilter],
  );
  const amp = useMemo(() => ampScale(data, scale, spread), [data, scale, spread]);
  // Top view is a plan (spectrogram): flatten the surface so tall peaks do
  // not lean toward the camera; colour carries the amplitude.
  const model = useMemo(
    () => placeModel(data, amp, top ? 0.001 : height),
    [data, amp, top, height],
  );

  // The colour legend (outside the canvas) shows this colour scale.
  const setLegend = useLegendStore((s) => s.setScale);
  useEffect(() => {
    setLegend({ ...amp, maxAmp: data.maxAmp });
    return () => setLegend(null);
  }, [data, amp, setLegend]);

  // The levels only matter while the highlight is on: moving them with it
  // off (or seeding them as a project opens) must not recolour the surface.
  const highlight = useMemo(
    () => (highlightOn ? { alarm, shutdown } : null),
    [highlightOn, alarm, shutdown],
  );
  const colour = useColormap('linear');
  const colors = useMemo(
    () => surfaceColours({ ...data, colourUnit: amp.colourUnit }, highlight, colour),
    [data, amp, highlight, colour],
  );
  const positions = useMemo(() => surfacePositions(model), [model]);

  // Row/bin indices change with the data; a stale hover would point elsewhere.
  const setHover = useHoverStore((s) => s.setHover);
  useEffect(() => setHover(null), [data, setHover]);

  // New colours are a change on-demand rendering must see.
  const palette = useScenePalette();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [palette, invalidate]);

  return (
    <>
      <ambientLight intensity={palette.lights.ambient} />
      <directionalLight position={LIGHT_POSITIONS.key} intensity={palette.lights.key} />
      <directionalLight position={LIGHT_POSITIONS.fill} intensity={palette.lights.fill} />
      <Surface
        nRows={model.nRows}
        nBins={model.nBins}
        positions={positions}
        colors={colors}
        lit={!top}
      />
      <Picker model={model} positions={positions} />
      <SpectrumLines model={model} positions={positions} />
      <HoverLayer model={model} physics={physics} />
      <CameraRig inset={inset} />
      <RedrawOnResize />
      <ImageExport name={imageName} />
      {/* Labels suspend while their font loads; keep that from holding back
          the surface. */}
      <Suspense fallback={null}>
        <Axes model={model} top={top} />
        {!top && <ThresholdPlanes model={model} />}
        <AnalysisLayers model={model} physics={physics} annotations={annotations} />
      </Suspense>
    </>
  );
}

/** Resizing the canvas clears it, and on-demand rendering does not repaint by
 *  itself — request a frame after every size change. */
function RedrawOnResize() {
  const { size, invalidate } = useThree();
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(id);
  }, [size.width, size.height, invalidate]);
  return null;
}

/* ─────────────────────────────  Picking  ──────────────────────────────── */

/** Tracks the pointer on the canvas and resolves it to the grid cell under it.
 *  Mouse: hover (not while dragging). Touch/pen: tap. At most once per frame. */
function Picker({ model, positions }: { model: WaterfallModel; positions: Float32Array }) {
  const { camera, gl } = useThree();
  const setHover = useHoverStore((s) => s.setHover);

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let frame = 0;
    let last: { x: number; y: number } | null = null;
    let down: { x: number; y: number } | null = null;

    const hitAt = (x: number, y: number) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = pickSurface(model, positions, raycaster.ray);
      return hit && hoverAt(model, hit);
    };
    const run = () => {
      frame = 0;
      if (last) setHover(hitAt(last.x, last.y));
    };
    const queue = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(run);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) queue(e);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
      if (e.pointerType !== 'mouse') queue(e);
    };
    // While picking a point for an annotation, a click (not a drag) on the
    // surface takes its frequency and speed.
    const onUp = (e: PointerEvent) => {
      const ui = useUIStore.getState();
      const click = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;
      down = null;
      if (!ui.picking || !click) return;
      const hit = hitAt(e.clientX, e.clientY);
      if (!hit) return;
      ui.setPicked({ freqHz: hit.freqHz, rpm: hit.rpm });
      ui.setPicking(false);
    };
    const onLeave = () => {
      last = null;
      setHover(null);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [camera, gl, model, positions, setHover]);

  return null;
}

/** "Save image": renders the view and downloads it as a PNG, labels and
 *  overlays included (the hover tooltip is not part of the canvas). */
function ImageExport({ name }: { name: string }) {
  const signal = useUIStore((s) => s.exportSignal);
  const { gl, scene, camera } = useThree();
  // Only a request made while this view is open downloads: the counter
  // outlives the view, and a value seen at mount is an old request.
  const handled = useRef(signal);
  useEffect(() => {
    if (signal === handled.current) return;
    handled.current = signal;
    // Without preserveDrawingBuffer the canvas is only readable right after
    // a render, so render and read in one go.
    gl.render(scene, camera);
    const a = document.createElement('a');
    a.href = gl.domElement.toDataURL('image/png');
    a.download = `${name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'waterfall'}.png`;
    a.click();
  }, [signal, gl, scene, camera, name]);
  return null;
}
