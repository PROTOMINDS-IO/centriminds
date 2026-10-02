// Vogel (sunflower / phyllotaxis) spiral. Used for the brand mark — a ring of
// dots that swirl outward from a small dark hole. The in-app Logo draws it,
// and public/favicon.svg is a static copy of the same dots, so the two
// visually agree.
//
// `count` is the number of *candidate* spiral indices generated; any whose
// spiral radius (c·√i) falls outside [innerHole, outerLimit] is dropped. The
// density is set by `c`: indices past (outerLimit / c)², about 748 with the
// defaults, always fall outside, so a `count` above that adds nothing.

export interface Dot {
  /** x coord in [-1, 1] */
  x: number;
  /** y coord in [-1, 1] */
  y: number;
  /** Dot radius in same units. */
  r: number;
  /** Spiral index (1-based). Useful as a stable key. */
  i: number;
  /** Distance from origin — handy for radial animation phasing. */
  rho: number;
  /** Angle in radians. */
  theta: number;
}

const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

interface Opts {
  count?: number;
  innerHole?: number;
  outerLimit?: number;
  /** Tuning constant for radial spacing. Smaller = denser. */
  c?: number;
  /** Per-dot radius range. */
  minDotR?: number;
  maxDotR?: number;
}

export function vogelDots(opts: Opts = {}): Dot[] {
  const {
    count = 1500,
    innerHole = 0.18,
    outerLimit = 0.93,
    c = 0.034,
    minDotR = 0.004,
    maxDotR = 0.03,
  } = opts;
  const out: Dot[] = [];
  for (let i = 1; i <= count; i++) {
    const rho = c * Math.sqrt(i);
    if (rho < innerHole || rho > outerLimit) continue;
    const theta = i * GOLDEN_ANGLE_RAD;
    const x = rho * Math.cos(theta);
    const y = rho * Math.sin(theta);
    const t = (rho - innerHole) / (outerLimit - innerHole);
    // Dots grow from the hole to the rim, fastest near the hole (power < 1).
    const r = minDotR + Math.pow(t, 0.55) * (maxDotR - minDotR);
    out.push({ x, y, r, i, rho, theta });
  }
  return out;
}
