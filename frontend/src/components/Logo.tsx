// Brand mark — the CentriMinds dot-circle pattern (Vogel spiral) rendered as
// inline SVG. When animated, each dot pulses with a radial wave so the field
// reads as a vibration emanating from the centre. The header mark animates
// only while hovered or focused (it is ~720 SVG nodes per frame), the sign-in
// hero while shown; both stay still under prefers-reduced-motion.
//
// The dots come from `vogelDots()`; public/favicon.svg is a static copy of
// the same geometry, so the two visually agree (change them together).
// Colours come from the theme tokens (accent-50 is the palest cyan on dark
// and the deepest teal on light), so the mark reads on either background
// without re-rendering when the theme changes.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import { useI18n } from '../i18n';
import { prefersReducedMotion } from '../lib/motion';
import { vogelDots, type Dot } from './vogelDots';

/** The mark with the CENTRIMINDS lockup as a link home, in the page header. */
export default function Logo({ size = 30 }: { size?: number }) {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to="/"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="group flex shrink-0 items-center gap-2.5 rounded-md ring-accent-400/40 outline-hidden focus-visible:ring-2"
      aria-label={t('app.shell.home')}
    >
      {/* A subtle wave; the sign-in hero's DotMark moves about twice as much. */}
      <DotMark size={size} intensity={0.08} hovered={hovered} animate={hovered} />
      {/* The lockup: wordmark with the maker's line under it, tracked so both
          lines end at the same edge. Part of the logo, so it is not translated
          (the footer's "A product by" is). */}
      <span className="hidden flex-col leading-none sm:flex">
        <span className="text-sm font-semibold tracking-[0.18em] text-ink-50">CENTRIMINDS</span>
        <span className="mt-[5px] -mr-[0.42em] text-[9px] font-medium tracking-[0.42em] text-ink-300">
          BY PROTOMINDS
        </span>
      </span>
    </Link>
  );
}

interface DotMarkProps {
  size: number;
  /** Amplitude of the wave, 0–1. */
  intensity: number;
  /** Hover look: a brighter accent and a faster, stronger wave. */
  hovered: boolean;
  /** Run the vibration animation (off = static mark, no per-frame work). */
  animate?: boolean;
}

/** The animated dot-circle. Reusable on the login hero at large sizes. */
export function DotMark({ size, intensity, hovered, animate = false }: DotMarkProps) {
  // Generate the dot field once per mount — keep it outside the animation
  // hot path. ~720 dots; cheap to render as static SVG, animation is just a
  // per-frame transform on each <circle>.
  const dots = useMemo<Dot[]>(() => vogelDots({}), []);
  const refs = useRef<Array<SVGCircleElement | null>>([]);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const startedAt = useRef(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const glowId = `cm-mark-glow${useId()}`;

  // Only animate while actually on screen (the desktop hero is display:none
  // below `lg`, and nothing should tick in a scrolled-away mark).
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = svgRef.current;
    if (!animate || !el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, [animate]);

  // Driven from rAF rather than CSS so each dot can be phased by its radial
  // distance, which makes a wave that radiates outward.
  useEffect(() => {
    if (!animate || !onScreen || prefersReducedMotion()) return;
    const ring = ringRef.current;
    const group = groupRef.current;
    const circles = refs.current;
    if (!startedAt.current) startedAt.current = performance.now();
    let raf = 0;
    const speed = hovered ? 5.2 : 2.4;
    const amp = hovered ? intensity * 1.6 : intensity;
    function tick(now: number) {
      const t = (now - startedAt.current) / 1000;
      // Outer ring breathes
      if (ring) {
        const ringPulse = 1 + Math.sin(t * speed * 0.7) * amp * 0.18;
        ring.setAttribute('transform', `scale(${ringPulse})`);
      }
      // Slow drift on the whole pattern
      if (group) {
        const rot = (t * (hovered ? 9 : 4)) % 360;
        group.setAttribute('transform', `rotate(${rot})`);
      }
      // Per-dot scale: phase = (rho * waveK) - (t * speed). The wave moves
      // outward, so a dot's scale is ahead of one further out.
      const waveK = 7.5;
      for (let i = 0; i < dots.length; i++) {
        const el = circles[i];
        if (!el) continue;
        const d = dots[i];
        const phase = d.rho * waveK - t * speed;
        const s = 1 + Math.sin(phase) * amp * (0.4 + d.rho * 0.7);
        el.setAttribute(
          'transform',
          `translate(${d.x.toFixed(4)} ${d.y.toFixed(4)}) scale(${s.toFixed(4)})`,
        );
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Settle back to the static mark.
      ring?.removeAttribute('transform');
      group?.removeAttribute('transform');
      dots.forEach((d, i) =>
        circles[i]?.setAttribute('transform', `translate(${d.x.toFixed(4)} ${d.y.toFixed(4)})`),
      );
    };
  }, [dots, hovered, intensity, animate, onScreen]);

  const ink = hovered ? 'var(--color-accent-300)' : 'var(--color-accent-50)';
  return (
    // Decorative: every use sits next to the name or inside a labelled link.
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="-1.05 -1.05 2.1 2.1"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="50%" r="60%">
          <stop
            offset="0%"
            stopOpacity="0.25"
            style={{
              stopColor: hovered ? 'var(--color-accent-300)' : 'var(--color-accent-200)',
            }}
          />
          <stop offset="100%" stopOpacity="0" style={{ stopColor: 'var(--color-ink-950)' }} />
        </radialGradient>
      </defs>
      {/* Soft halo — gives depth without being a hard background */}
      <circle cx="0" cy="0" r="1.05" fill={`url(#${glowId})`} />
      {/* Outer ring */}
      <circle
        ref={ringRef}
        cx="0"
        cy="0"
        r="0.97"
        fill="none"
        strokeWidth={0.04}
        style={{
          stroke: ink,
          transition: 'stroke 200ms ease',
          transformBox: 'fill-box',
          transformOrigin: 'center',
        }}
      />
      {/* Dot field */}
      <g ref={groupRef} style={{ fill: ink, transition: 'fill 200ms ease' }}>
        {dots.map((d, i) => (
          <circle
            key={d.i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            cx="0"
            cy="0"
            r={d.r}
            transform={`translate(${d.x.toFixed(4)} ${d.y.toFixed(4)})`}
          />
        ))}
      </g>
    </svg>
  );
}
