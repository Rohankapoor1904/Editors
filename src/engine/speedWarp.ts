import { LuminanceFrame } from './masking/pointTracker';

/**
 * R24.5 — motion-compensated frame interpolation (Speed Warp class).
 *
 * Slow motion needs frames that were never captured. This module estimates
 * per-block translation between two frames with sum-of-absolute-differences
 * block matching, then synthesizes the in-between frame by sampling both
 * inputs along the scaled motion vectors and blending. Duration/timing
 * stays in rational time via the existing speedRamp engine — this file owns
 * only pixel synthesis, never the timeline.
 *
 * Honest scope: translational block motion with a zero-motion tie-break
 * (flat regions report no motion rather than noise). Occlusion reasoning,
 * sub-pixel flow and learned interpolation are deferred and stated as such.
 */

export interface MotionVector {
  dx: number;
  dy: number;
  sad: number;
}

export interface MotionField {
  blockSize: number;
  cols: number;
  rows: number;
  vectors: MotionVector[];
}

function checkPair(prev: LuminanceFrame, curr: LuminanceFrame): void {
  for (const [label, f] of [['prev', prev], ['curr', curr]] as const) {
    if (!f || !Number.isInteger(f.width) || f.width <= 0) {
      throw new Error(`speedWarp: ${label} has invalid width`);
    }
    if (!Number.isInteger(f.height) || f.height <= 0) {
      throw new Error(`speedWarp: ${label} has invalid height`);
    }
    if (!f.data || f.data.length < f.width * f.height) {
      throw new Error(`speedWarp: ${label} buffer is smaller than width*height`);
    }
  }
  if (prev.width !== curr.width || prev.height !== curr.height) {
    throw new Error('speedWarp: frame dimensions must match');
  }
}

function sampleAt(frame: LuminanceFrame, x: number, y: number): number {
  return frame.data[y * frame.width + x];
}

/**
 * R24.5 — SAD block matching over non-overlapping blocks. Ties resolve to
 * the smallest displacement (flat regions honestly report stillness).
 */
export function computeBlockMotion(
  prev: LuminanceFrame,
  curr: LuminanceFrame,
  blockSize = 8,
  searchRadius = 8
): MotionField {
  checkPair(prev, curr);
  if (!Number.isInteger(blockSize) || blockSize < 4) {
    throw new Error('speedWarp: blockSize must be an integer >= 4');
  }
  if (!Number.isInteger(searchRadius) || searchRadius < 0) {
    throw new Error('speedWarp: searchRadius must be a non-negative integer');
  }
  const cols = Math.floor(prev.width / blockSize);
  const rows = Math.floor(prev.height / blockSize);
  if (cols < 1 || rows < 1) {
    throw new Error('speedWarp: frame smaller than one block');
  }
  const vectors: MotionVector[] = [];
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const x0 = bx * blockSize;
      const y0 = by * blockSize;
      let best: MotionVector = { dx: 0, dy: 0, sad: Infinity };
      for (let dy = -searchRadius; dy <= searchRadius; dy++) {
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          const cx = x0 + dx;
          const cy = y0 + dy;
          if (cx < 0 || cy < 0 || cx + blockSize > curr.width || cy + blockSize > curr.height) continue;
          let sad = 0;
          for (let oy = 0; oy < blockSize; oy++) {
            for (let ox = 0; ox < blockSize; ox++) {
              sad += Math.abs(sampleAt(prev, x0 + ox, y0 + oy) - sampleAt(curr, cx + ox, cy + oy));
            }
          }
          const mag = Math.abs(dx) + Math.abs(dy);
          const bestMag = Math.abs(best.dx) + Math.abs(best.dy);
          if (sad < best.sad || (sad === best.sad && mag < bestMag)) {
            best = { dx, dy, sad };
          }
        }
      }
      vectors.push(best);
    }
  }
  return { blockSize, cols, rows, vectors };
}

function bilinear(frame: LuminanceFrame, x: number, y: number): number {
  const x0 = Math.max(0, Math.min(frame.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(frame.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(frame.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(frame.height - 1, y0 + 1));
  const tx = Math.max(0, Math.min(1, x - x0));
  const ty = Math.max(0, Math.min(1, y - y0));
  const a = sampleAt(frame, x0, y0);
  const b = sampleAt(frame, x1, y0);
  const c = sampleAt(frame, x0, y1);
  const d = sampleAt(frame, x1, y1);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/**
 * R24.5 — synthesizes the frame at phase t in [0,1] between prev and curr.
 * Each output pixel follows its block's motion vector symmetrically:
 * prev is sampled behind, curr ahead, blended by t. t=0 reproduces prev
 * bit-exactly, t=1 reproduces curr (both pinned by test).
 */
export function interpolateFrame(
  prev: LuminanceFrame,
  curr: LuminanceFrame,
  field: MotionField,
  t: number
): LuminanceFrame {
  checkPair(prev, curr);
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 1) {
    throw new Error('speedWarp: t must be within [0,1]');
  }
  if (field.cols < 1 || field.rows < 1 || field.vectors.length !== field.cols * field.rows) {
    throw new Error('speedWarp: motion field grid does not match its vector array');
  }
  if (field.cols * field.blockSize > prev.width || field.rows * field.blockSize > prev.height) {
    throw new Error('speedWarp: motion field does not match the frame size');
  }
  const out = new Float64Array(prev.width * prev.height);
  for (let y = 0; y < prev.height; y++) {
    for (let x = 0; x < prev.width; x++) {
      const bx = Math.min(field.cols - 1, Math.floor(x / field.blockSize));
      const by = Math.min(field.rows - 1, Math.floor(y / field.blockSize));
      const v = field.vectors[by * field.cols + bx];
      const p = bilinear(prev, x - t * v.dx, y - t * v.dy);
      const c = bilinear(curr, x + (1 - t) * v.dx, y + (1 - t) * v.dy);
      out[y * prev.width + x] = p * (1 - t) + c * t;
    }
  }
  return { width: prev.width, height: prev.height, data: out };
}
