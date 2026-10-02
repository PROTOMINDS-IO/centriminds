// The frame of the 3D waterfall: the floor outline, the frequency, speed and
// amplitude axes with their ticks, and the alarm and shutdown planes.
import { memo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

import { useI18n } from '../../i18n';
import { niceTicks } from '../../lib/ticks';
import { useUIStore } from '../../store/uiStore';
import { tickText } from './labels';
import { HALF, type WaterfallModel } from './model';
import { useScenePalette } from './palette';
import { Label } from './sceneParts';
import { ALARM_HEX, SHUTDOWN_HEX } from './surface';

/** The square edge of the floor, closed. */
const FLOOR_OUTLINE: [number, number, number][] = [
  [-HALF, 0, -HALF],
  [HALF, 0, -HALF],
  [HALF, 0, HALF],
  [-HALF, 0, HALF],
  [-HALF, 0, -HALF],
];

export const Axes = memo(function Axes({ model, top }: { model: WaterfallModel; top: boolean }) {
  const { t, fmt } = useI18n();
  const palette = useScenePalette();
  const freqTicks = niceTicks(model.freqMin, model.freqMax, 6);
  const rpmTicks = model.rpmMax > model.rpmMin ? niceTicks(model.rpmMin, model.rpmMax, 5) : [];
  // Log scale: the decades in range, but none in the bottom 5 % (the floor).
  const ampTicks =
    model.scale === 'log'
      ? [0.01, 0.1, 1, 10, 100, 1000].filter((v) => v >= model.ampOfUnit(0.05) && v <= model.maxAmp)
      : niceTicks(0, model.maxAmp, 4);
  const h = model.height;

  return (
    <group>
      <Line
        points={FLOOR_OUTLINE}
        color={palette.axis}
        lineWidth={0.7}
        transparent
        opacity={palette.axisOpacity}
      />

      {freqTicks.map((hz) => {
        const x = model.xOfFreq(hz);
        return (
          <group key={`f${hz}`}>
            <Line
              points={[
                [x, 0, HALF],
                [x, 0, HALF + 0.035],
              ]}
              color={palette.tick}
              lineWidth={0.6}
            />
            <Label
              position={[x, top ? 0 : -0.06, HALF + (top ? 0.09 : 0.04)]}
              anchorY={top ? 'middle' : 'top'}
            >
              {tickText(hz, fmt)}
            </Label>
          </group>
        );
      })}
      <Label
        position={[0, top ? 0 : -0.19, HALF + (top ? 0.2 : 0.08)]}
        size={0.065}
        color={palette.textMuted}
      >
        {t('workspace.scene.frequencyAxis')}
      </Label>

      {rpmTicks.map((rpm) => {
        const z = model.zOfRpm(rpm);
        return (
          <group key={`r${rpm}`}>
            <Line
              points={[
                [-HALF, 0, z],
                [-HALF - 0.035, 0, z],
              ]}
              color={palette.tick}
              lineWidth={0.6}
            />
            <Label position={[-HALF - 0.07, 0, z]} anchorX="right">
              {tickText(rpm, fmt)}
            </Label>
          </group>
        );
      })}
      <Label
        position={[-HALF - 0.07, 0, -HALF - 0.14]}
        anchorX="right"
        size={0.065}
        color={palette.textMuted}
      >
        {t('workspace.scene.speedAxis')}
      </Label>

      {!top && (
        <group>
          <Line
            points={[
              [-HALF, 0, -HALF],
              [-HALF, h, -HALF],
            ]}
            color={palette.axis}
            lineWidth={0.7}
            transparent
            opacity={palette.axisOpacity}
          />
          {ampTicks.map((v) => {
            const y = model.yOfAmp(v);
            return (
              <group key={`a${v}`}>
                <Line
                  points={[
                    [-HALF, y, -HALF],
                    [-HALF - 0.035, y, -HALF],
                  ]}
                  color={palette.tick}
                  lineWidth={0.6}
                />
                <Label position={[-HALF - 0.07, y, -HALF]} anchorX="right">
                  {tickText(v, fmt)}
                </Label>
              </group>
            );
          })}
          <Label position={[-HALF, h + 0.09, -HALF]} size={0.065} color={palette.textMuted}>
            {model.scale === 'log'
              ? t('workspace.scene.amplitudeAxisLog')
              : t('workspace.scene.amplitudeAxis')}
          </Label>
        </group>
      )}
    </group>
  );
});

/** Planes at the alarm and shutdown levels: seeded from the rating, adjustable
 *  in the display panel. */
export function ThresholdPlanes({ model }: { model: WaterfallModel }) {
  const { t, fmt } = useI18n();
  const palette = useScenePalette();
  const show = useUIStore((s) => s.showThresholds);
  const alarm = useUIStore((s) => s.alarmMmS);
  const shutdown = useUIStore((s) => s.shutdownMmS);
  if (!show) return null;
  return (
    <group>
      <LevelPlane
        model={model}
        level={alarm}
        color={ALARM_HEX}
        textColor={palette.alarmText}
        label={t('workspace.scene.alarm', { value: tickText(alarm, fmt) })}
      />
      <LevelPlane
        model={model}
        level={shutdown}
        color={SHUTDOWN_HEX}
        textColor={palette.shutdownText}
        label={t('workspace.scene.shutdown', { value: tickText(shutdown, fmt) })}
      />
    </group>
  );
}

/** One level's plane, outline and label. A level above the highest amplitude
 *  shown sits at the top of the scale, fainter, and its label says so. */
function LevelPlane({
  model,
  level,
  color,
  textColor,
  label,
}: {
  model: WaterfallModel;
  level: number;
  /** Fixed status colour of the plane. */
  color: string;
  textColor: string;
  label: string;
}) {
  const { t } = useI18n();
  const above = level > model.maxAmp;
  const y = model.yOfAmp(level);
  return (
    <group position={[0, y, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[2 * HALF, 2 * HALF]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={above ? 0.04 : 0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Line
        points={FLOOR_OUTLINE}
        color={color}
        lineWidth={0.9}
        transparent
        opacity={above ? 0.35 : 0.7}
      />
      <Label position={[HALF + 0.05, 0, -HALF]} anchorX="left" color={textColor}>
        {above ? t('workspace.scene.aboveData', { level: label }) : label}
      </Label>
    </group>
  );
}
