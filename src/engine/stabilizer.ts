import { LuminanceFrame, trackPoint } from './masking/pointTracker';

/**
 * R24.5 — translation video stabilizer (classic smooth-the-camera-path).
 *
 * Pipeline: (1) estimate per-pair global translation by tracking a grid of
 * NCC points between consecutive frames and taking the median displacement
 * (robust to flat/featureless dropouts, which throw per-point and are
 * skipped); (2) integrate to a cumulative camera path; (3) smooth the path
 * with an edge-clamped moving average; (4) emit per-frame corrections
 * (smoothed − raw) that re-anchor footage to the smooth path.
 *
 * Honest scope: pure translation. Rotation, scale, rolling shutter and
 * motion-blur-aware inpainting of exposed borders are deferred and stated
 * as such — this module never claims them.
 */

export interface FrameShift {
  /** Translation from frame i to frame i+1, pixels. */
  dx: number;
  dy: number;
  /** Fraction of grid points that tracked successfully, 0..1. */
  coverage: number;
  /** Median NCC score of the successful tracks, -1..1. */
  confidence: number;
}

export interface StabilizerOptions {
  /** Grid density per axis (gridSize × gridSize points). Default 4. */
  gridSize?: number;
  /** NCC template half-width. Default 8. */
  templateHalfWidth?: number;
  /** NCC search radius. Default 12. */
  searchRadius?: number;
  /** Moving-average half-window for path smoothing. Default 6. */
  smoothingRadius?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function checkFrames(frames: LuminanceFrame[]): { width: number; height: number } {
  if (!Array.isArray(frames) || frames.length < 2) {
    throw new Error('stabilizer: need at least 2 frames to estimate motion');
  }
  const { width, height } = frames[0];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f || f.width !== width || f.height !== height) {
      throw new Error(`stabilizer: frame ${i} dimensions do not match the sequence`);
    }
    if (!f.data || f.data.length < width * height) {
      throw new Error(`stabilizer: frame ${i} buffer is smaller than width*height`);
    }
  }
  return { width, height };
}

/**
 * R24.5 — estimates global translation between each consecutive frame pair.
 * Throws when no pair yields enough successful tracks to trust.
 */
export function estimateFrameShifts(frames: LuminanceFrame[], opts: StabilizerOptions = {}): FrameShift[] {
  const { width, height } = checkFrames(frames);
  const gridSize = opts.gridSize ?? 4;
  const templateHalfWidth = opts.templateHalfWidth ?? 8;
  const searchRadius = opts.searchRadius ?? 12;
  if (!Number.isInteger(gridSize) || gridSize < 2) {
    throw new Error('stabilizer: gridSize must be an integer >= 2');
  }
  const margin = templateHalfWidth + searchRadius + 1;
  if (margin * 2 >= Math.min(width, height)) {
    throw new Error('stabilizer: frame too small for the tracking grid margins');
  }

  const seeds: { x: number; y: number }[] = [];
  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      seeds.push({
        x: margin + ((width - 2 * margin) * gx) / (gridSize - 1),
        y: margin + ((height - 2 * margin) * gy) / (gridSize - 1),
      });
    }
  }

  const shifts: FrameShift[] = [];
  for (let i = 0; i < frames.length - 1; i++) {
    const dxs: number[] = [];
    const dys: number[] = [];
    const scores: number[] = [];
    for (const seed of seeds) {
      try {
        const tracked = trackPoint(frames[i], frames[i + 1], seed.x, seed.y, templateHalfWidth, searchRadius);
        dxs.push(tracked.x - Math.round(seed.x));
        dys.push(tracked.y - Math.round(seed.y));
        scores.push(tracked.score);
      } catch {
        // Featureless or out-of-bounds seed: skip it rather than guessing.
      }
    }
    if (dxs.length === 0) {
      throw new Error(`stabilizer: no grid point tracked between frames ${i} and ${i + 1}`);
    }
    shifts.push({
      dx: median(dxs),
      dy: median(dys),
      coverage: dxs.length / seeds.length,
      confidence: median(scores),
    });
  }
  return shifts;
}

export interface CameraPathPoint {
  x: number;
  y: number;
}

/** R24.5 — integrates per-pair shifts into a cumulative camera path. */
export function integratePath(shifts: FrameShift[]): CameraPathPoint[] {
  const path: CameraPathPoint[] = [{ x: 0, y: 0 }];
  for (const s of shifts) {
    const last = path[path.length - 1];
    path.push({ x: last.x + s.dx, y: last.y + s.dy });
  }
  return path;
}

/**
 * R24.5 — edge-clamped moving-average smoothing of a camera path.
 * Radius 0 returns the path unchanged (handy for tests pinning identity).
 */
export function smoothPath(path: CameraPathPoint[], radius = 6): CameraPathPoint[] {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error('stabilizer: path must be non-empty');
  }
  if (!Number.isInteger(radius) || radius < 0) {
    throw new Error('stabilizer: smoothingRadius must be a non-negative integer');
  }
  return path.map((_, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(path.length - 1, i + radius);
    let sx = 0;
    let sy = 0;
    for (let j = lo; j <= hi; j++) {
      sx += path[j].x;
      sy += path[j].y;
    }
    const n = hi - lo + 1;
    return { x: sx / n, y: sy / n };
  });
}

export interface FrameCorrection {
  /** Translation to apply to frame i (pixels) anchoring it to the smooth path. */
  dx: number;
  dy: number;
}

/**
 * R24.5 — full pass: estimate → integrate → smooth → correct.
 * Applying correction[i] to frame i reproduces the smoothed path exactly
 * (pinned by test); inter-frame jitter energy is bounded by the smoother.
 */
export function stabilizeFrames(
  frames: LuminanceFrame[],
  opts: StabilizerOptions = {}
): { shifts: FrameShift[]; path: CameraPathPoint[]; smooth: CameraPathPoint[]; corrections: FrameCorrection[] } {
  const shifts = estimateFrameShifts(frames, opts);
  const path = integratePath(shifts);
  const smooth = smoothPath(path, opts.smoothingRadius ?? 6);
  const corrections = path.map((p, i) => ({ dx: smooth[i].x - p.x, dy: smooth[i].y - p.y }));
  return { shifts, path, smooth, corrections };
}
