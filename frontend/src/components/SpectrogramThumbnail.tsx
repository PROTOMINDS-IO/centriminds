// Tiny canvas painter for the project list. Lazily fetches the thumbnail
// when the row comes within 200 px of the viewport (IntersectionObserver) so
// a long list of projects doesn't fire dozens of requests up front.
import { useEffect, useRef, useState } from 'react';

import { useThumbnail } from '../hooks/queries';
import { useColormap } from '../hooks/useColormap';

interface Props {
  projectId: number;
  width?: number;
  height?: number;
  className?: string;
  /** Stretch to the parent's width; `width` then only sets the resolution. */
  fluid?: boolean;
}

export default function SpectrogramThumbnail({
  projectId,
  width = 160,
  height = 56,
  className = '',
  fluid = false,
}: Props) {
  const colour = useColormap();
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || visible) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [visible]);

  const { data, isLoading } = useThumbnail(visible ? projectId : undefined);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // The matrix is [n_blocks][bin_count], rows by ascending speed and scaled
    // to [0, 1] by the backend. It is painted with speed upwards (high rpm at
    // the top) and frequency to the right.
    const rows = data.z_matrix.length;
    const cols = data.z_matrix[0]?.length ?? 0;
    if (!rows || !cols) return;

    // Bilinear resampling of the matrix to one value per canvas pixel,
    // written straight into ImageData.
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const ry = (1 - y / Math.max(1, h - 1)) * (rows - 1); // flip so high RPM at top
      const r0 = Math.floor(ry);
      const r1 = Math.min(rows - 1, r0 + 1);
      const ru = ry - r0;
      for (let x = 0; x < w; x++) {
        const cx = (x / Math.max(1, w - 1)) * (cols - 1);
        const c0 = Math.floor(cx);
        const c1 = Math.min(cols - 1, c0 + 1);
        const cu = cx - c0;
        const v00 = data.z_matrix[r0][c0];
        const v01 = data.z_matrix[r0][c1];
        const v10 = data.z_matrix[r1][c0];
        const v11 = data.z_matrix[r1][c1];
        const v0 = v00 + (v01 - v00) * cu;
        const v1 = v10 + (v11 - v10) * cu;
        const v = v0 + (v1 - v0) * ru;
        // Gamma-compress: one resonance peak can be 20× the rest of the sweep,
        // which would leave everything else near the zero colour at a linear
        // scale.
        const [r, g, b] = colour(Math.pow(Math.max(0, v), 0.4));
        const idx = (y * w + x) * 4;
        img.data[idx + 0] = r * 255;
        img.data[idx + 1] = g * 255;
        img.data[idx + 2] = b * 255;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [data, colour]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-md ring-1 ring-edge/10 ${className}`}
      style={{ width: fluid ? '100%' : width, height }}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="h-full w-full"
        aria-hidden="true"
      />
      {(!visible || isLoading || !data) && (
        <div className="absolute inset-0 grid place-items-center bg-ink-800/80">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400/70" />
        </div>
      )}
    </div>
  );
}
