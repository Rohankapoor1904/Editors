import { Keyframe } from '../types/timeline';
import { RationalTime, compareRational, subRational } from '../types/time';

/**
 * Standard cubic Bezier control points [x1, y1, x2, y2]
 */
export const EASING_PRESETS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1.0],
  'ease-in': [0.42, 0.0, 1.0, 1.0],
  'ease-out': [0.0, 0.0, 0.58, 1.0],
  'ease-in-out': [0.42, 0.0, 0.58, 1.0],
};

/**
 * Evaluates a unit cubic Bezier curve at progress x in [0, 1] using Newton-Raphson iteration
 * with binary subdivision fallback.
 */
export function solveCubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number
): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x1 === y1 && x2 === y2) return x; // Linear optimization

  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleCurveDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  // Newton-Raphson iteration to solve for t given x
  let t = x;
  for (let i = 0; i < 8; i++) {
    const currentX = sampleCurveX(t) - x;
    if (Math.abs(currentX) < 1e-6) {
      return sampleCurveY(t);
    }
    const dX = sampleCurveDerivativeX(t);
    if (Math.abs(dX) < 1e-6) break;
    t -= currentX / dX;
  }

  // Fallback to binary bisection if Newton-Raphson does not converge
  let t0 = 0;
  let t1 = 1;
  t = x;

  while (t0 < t1) {
    const currentX = sampleCurveX(t);
    if (Math.abs(currentX - x) < 1e-6) {
      return sampleCurveY(t);
    }
    if (x > currentX) {
      t0 = t;
    } else {
      t1 = t;
    }
    t = (t1 + t0) * 0.5;
    if (Math.abs(t1 - t0) < 1e-6) break;
  }

  return sampleCurveY(t);
}

/**
 * Resolves an easing identifier or custom cubic-bezier string to a progress multiplier [0, 1]
 */
export function evaluateEasing(easing: string | undefined, progress: number): number {
  if (!easing || easing === 'linear') {
    return progress;
  }

  const preset = EASING_PRESETS[easing.toLowerCase()];
  if (preset) {
    return solveCubicBezier(preset[0], preset[1], preset[2], preset[3], progress);
  }

  // Check for CSS-style cubic-bezier(x1, y1, x2, y2)
  const cubicMatch = easing.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*([\d.]+)\s*,\s*(-?[\d.]+)\s*\)/i);
  if (cubicMatch) {
    const [, x1, y1, x2, y2] = cubicMatch.map(Number);
    return solveCubicBezier(x1, y1, x2, y2, progress);
  }

  // Default to linear if unrecognized
  return progress;
}

/**
 * Interpolates a value at time t across keyframe array using linear or cubic bezier easing
 */
export function interpolateKeyframeValue(keyframes: Keyframe[], time: RationalTime): number {
  if (!keyframes || keyframes.length === 0) return 0;
  if (keyframes.length === 1 || compareRational(time, keyframes[0].time) <= 0) return keyframes[0].value;
  if (compareRational(time, keyframes[keyframes.length - 1].time) >= 0) {
    return keyframes[keyframes.length - 1].value;
  }

  // Find bounding keyframe interval
  let k0 = keyframes[0];
  let k1 = keyframes[1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (compareRational(time, keyframes[i].time) >= 0 && compareRational(time, keyframes[i + 1].time) <= 0) {
      k0 = keyframes[i];
      k1 = keyframes[i + 1];
      break;
    }
  }

  const durationRational = subRational(k1.time, k0.time);
  const duration = durationRational.value / durationRational.rate;
  if (duration <= 0) return k0.value;

  const timeDiffRational = subRational(time, k0.time);
  const timeDiff = timeDiffRational.value / timeDiffRational.rate;

  const rawProgress = Math.max(0, Math.min(1, timeDiff / duration));
  const easedProgress = evaluateEasing(k0.easing, rawProgress);

  return k0.value + easedProgress * (k1.value - k0.value);
}

/**
 * Extracts the 4 cubic bezier control coordinates [x1, y1, x2, y2] from an easing string or preset
 */
export function parseCubicBezier(easing?: string): [number, number, number, number] {
  if (!easing || easing === 'linear') {
    return [0, 0, 1, 1];
  }

  const preset = EASING_PRESETS[easing.toLowerCase()];
  if (preset) {
    return [...preset];
  }

  const cubicMatch = easing.match(
    /cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/i
  );
  if (cubicMatch) {
    const x1 = Math.max(0, Math.min(1, parseFloat(cubicMatch[1]) || 0));
    const y1 = parseFloat(cubicMatch[2]) || 0;
    const x2 = Math.max(0, Math.min(1, parseFloat(cubicMatch[3]) || 1));
    const y2 = parseFloat(cubicMatch[4]) || 1;
    return [x1, y1, x2, y2];
  }

  return [0, 0, 1, 1];
}

/**
 * Formats 4 cubic bezier control coordinates into a CSS-standard cubic-bezier string
 */
export function formatCubicBezier(x1: number, y1: number, x2: number, y2: number): string {
  const clampX = (v: number) => Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
  const roundY = (v: number) => Math.round(v * 1000) / 1000;
  return `cubic-bezier(${clampX(x1)}, ${roundY(y1)}, ${clampX(x2)}, ${roundY(y2)})`;
}

/**
 * Generates an array of sampled { x, y } curve coordinates between 0 and 1 for rendering
 */
export function sampleCubicBezierCurve(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  steps = 25
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const y = solveCubicBezier(x1, y1, x2, y2, progress);
    points.push({ x: progress, y });
  }
  return points;
}

