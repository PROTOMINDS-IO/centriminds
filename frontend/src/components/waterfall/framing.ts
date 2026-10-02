// Lens framing of the waterfall: how far to zoom for the pane's shape, and
// how far to shift the picture so the surface sits in the middle of the room
// the expanded floating cards leave free. Both are lens changes (camera zoom
// and view offset): the orbit is untouched, and picking stays exact because
// it uses the same projection.
//
// Also the two viewpoints the camera flies between (CameraRig.tsx).

type Vec3 = [number, number, number];

/** The perspective view, and where the canvas places its camera first. */
export const VIEW_3D: { position: Vec3; target: Vec3 } = {
  position: [2.6, 2.0, 2.6],
  target: [0, 0.3, 0],
};
export const VIEW_TOP: { position: Vec3; target: Vec3 } = {
  // Straight down, nudged toward +z: looking exactly along the camera's up
  // axis leaves its orientation undefined, and the nudge puts slow speeds
  // at the bottom of the screen.
  position: [0, 3.15, 0.0001],
  target: [0, 0, 0],
};

/** Room (px) covered by expanded cards on either side of the view. */
export interface Insets {
  left: number;
  right: number;
}

export const NO_INSETS: Insets = { left: 0, right: 0 };

/** Narrow panes and phones get a wider lens; wide panes stop at the maximum. */
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 0.85;

export interface Framing {
  /** Camera zoom; below 1 the lens is wider than the camera's own fov. */
  zoom: number;
  /** Horizontal shift of the picture in px (positive = to the right). */
  shift: number;
}

/**
 * Zoom and shift for a canvas of `width` × `height` px with `insets` covered
 * by cards. The surface fills ~45 % of the pane's width; when the cards
 * leave less room than that needs, the lens widens so the surface keeps to
 * ~70 % of the free width. The shift moves the picture's centre to the
 * middle of the free room.
 */
export function frameView(width: number, height: number, insets: Insets = NO_INSETS): Framing {
  const h = Math.max(1, height);
  const free = Math.max(1, width - insets.left - insets.right);
  const zoom = Math.min(width / (1.8 * h), free / (1.2 * h));
  return {
    zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
    shift: (insets.left - insets.right) / 2,
  };
}
