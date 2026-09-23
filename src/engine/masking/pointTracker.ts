/**
 * R24.1 — real template point tracker (normalized cross-correlation).
 *
 * Tracks a single point between two luminance frames by matching a square
 * template around the previous position against a search window in the
 * current frame. This is genuine computation over caller-supplied pixels:
 * identical frames yield zero displacement with score 1, and translated
 * features yield the exact integer displacement. There is no motion model,
 * no smoothing, and no invented trajectory — unusable input (out-of-bounds
 * template, featureless template, empty search) throws instead of guessing.
 */

export interface LuminanceFrame {
  width: number;
  height: number;
  /** Row-major luminance samples. */
  data: ArrayLike<number>;
}

export interface PointTrackResult {
  /** Tracked position in current-frame pixels (integer precision). */
  x: number;
  y: number;
  /** Normalized cross-correlation of the winning template, -1..1. */
  score: number;
}

function sampleAt(frame: LuminanceFrame, x: number, y: number): number {
  return frame.data[y * frame.width + x];
}

function checkFrame(frame: LuminanceFrame, label: string): void {
  if (!frame || !Number.isInteger(frame.width) || frame.width <= 0) {
    throw new Error(`pointTracker: ${label} has invalid width`);
  }
  if (!Number.isInteger(frame.height) || frame.height <= 0) {
    throw new Error(`pointTracker: ${label} has invalid height`);
  }
  if (!frame.data || frame.data.length < frame.width * frame.height) {
    throw new Error(`pointTracker: ${label} buffer is smaller than width*height`);
  }
}

function regionInside(frame: LuminanceFrame, cx: number, cy: number, half: number): boolean {
  return cx - half >= 0 && cy - half >= 0 && cx + half < frame.width && cy + half < frame.height;
}

function normalizedCorrelation(
  prev: LuminanceFrame,
  curr: LuminanceFrame,
  px: number,
  py: number,
  cx: number,
  cy: number,
  half: number,
  templateMean: number,
  templateVar: number
): number {
  const n = (2 * half + 1) * (2 * half + 1);
  let sum = 0;
  let sumSq = 0;
  let cross = 0;
  for (let oy = -half; oy <= half; oy++) {
    for (let ox = -half; ox <= half; ox++) {
      const t = sampleAt(prev, px + ox, py + oy) - templateMean;
      const c = sampleAt(curr, cx + ox, cy + oy);
      sum += c;
      sumSq += c * c;
      cross += t * c;
    }
  }
  const candMean = sum / n;
  // sum of (c - mean)^2 expanded to avoid a second pass.
  const candVar = sumSq - (sum * sum) / n;
  void candMean;
  if (candVar <= 0) return -1;
  return cross / Math.sqrt(templateVar * candVar);
}

export function trackPoint(
  prev: LuminanceFrame,
  curr: LuminanceFrame,
  x: number,
  y: number,
  templateHalfWidth = 8,
  searchRadius = 12
): PointTrackResult {
  checkFrame(prev, 'prev frame');
  checkFrame(curr, 'curr frame');
  if (prev.width !== curr.width || prev.height !== curr.height) {
    throw new Error('pointTracker: frame dimensions must match');
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('pointTracker: seed position must be finite');
  }
  if (!Number.isInteger(templateHalfWidth) || templateHalfWidth < 1) {
    throw new Error('pointTracker: templateHalfWidth must be a positive integer');
  }
  if (!Number.isInteger(searchRadius) || searchRadius < 0) {
    throw new Error('pointTracker: searchRadius must be a non-negative integer');
  }

  const px = Math.round(x);
  const py = Math.round(y);
  if (!regionInside(prev, px, py, templateHalfWidth)) {
    throw new Error('pointTracker: template around the seed position exceeds the prev frame bounds');
  }

  // Template statistics from the prev frame.
  const n = (2 * templateHalfWidth + 1) * (2 * templateHalfWidth + 1);
  let tSum = 0;
  let tSumSq = 0;
  for (let oy = -templateHalfWidth; oy <= templateHalfWidth; oy++) {
    for (let ox = -templateHalfWidth; ox <= templateHalfWidth; ox++) {
      const v = sampleAt(prev, px + ox, py + oy);
      tSum += v;
      tSumSq += v * v;
    }
  }
  const templateMean = tSum / n;
  const templateVar = tSumSq - (tSum * tSum) / n;
  if (templateVar <= 0) {
    throw new Error('pointTracker: template is featureless (zero variance) — refusing to invent motion');
  }

  let bestScore = -Infinity;
  let bestX = px;
  let bestY = py;
  let candidates = 0;
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const cx = px + dx;
      const cy = py + dy;
      if (!regionInside(curr, cx, cy, templateHalfWidth)) continue;
      candidates++;
      const score = normalizedCorrelation(prev, curr, px, py, cx, cy, templateHalfWidth, templateMean, templateVar);
      if (score > bestScore) {
        bestScore = score;
        bestX = cx;
        bestY = cy;
      }
    }
  }
  if (candidates === 0) {
    throw new Error('pointTracker: no search candidate fits inside the curr frame bounds');
  }

  // NOTE: integer-pixel precision only. A parabolic sub-pixel refinement was
  // tried here and removed: on step edges it fits a parabola to a
  // non-parabolic peak and biases the result by ~0.2px (caught by the
  // exact-displacement behavioural tests). Sub-pixel stays deferred until a
  // genuinely better estimator (e.g. gradient-based) lands with its own test.
  return { x: bestX, y: bestY, score: bestScore };
}
