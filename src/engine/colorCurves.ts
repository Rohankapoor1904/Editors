import type { RGBColor } from './colorEngine';

/**
 * R24.2 — RGB + master 1D tone curves.
 *
 * Control points live in normalized [0,1] and are evaluated with piecewise
 * linear interpolation. Linear (not cubic) is deliberate: cubics overshoot
 * on sparse points and invent values outside the authored range, while
 * linear segments reproduce authored points exactly and stay bounded.
 * An absent or empty channel curve is the identity (no-op).
 */

export interface CurvePoint {
  input: number;
  output: number;
}

export interface RGBCurves {
  master?: CurvePoint[];
  red?: CurvePoint[];
  green?: CurvePoint[];
  blue?: CurvePoint[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validatePoints(points: CurvePoint[], label: string): void {
  if (points.length === 0) return; // identity, no-op
  if (points.length === 1) {
    throw new Error(`colorCurves: '${label}' needs at least 2 control points to interpolate`);
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!isFiniteNumber(p.input) || p.input < 0 || p.input > 1) {
      throw new Error(`colorCurves: '${label}' point ${i} input must be within [0,1]`);
    }
    if (!isFiniteNumber(p.output) || p.output < 0 || p.output > 1) {
      throw new Error(`colorCurves: '${label}' point ${i} output must be within [0,1]`);
    }
    if (i > 0 && p.input <= points[i - 1].input) {
      throw new Error(`colorCurves: '${label}' inputs must be strictly increasing`);
    }
  }
}

/** R24.2 — baked 1D curve LUT resolution (GPU uniform array entries). */
export const CURVE_LUT_SIZE = 64;

/**
 * R24.2 — true when any channel carries authored control points.
 * Identity/absent curves keep the WGSL stage disabled so legacy grades
 * render bit-identically to before.
 */
export function curvesEnabled(settings: { curves?: RGBCurves }): boolean {
  const c = settings.curves;
  if (!c) return false;
  return [c.master, c.red, c.green, c.blue].some((ch) => !!ch && ch.length > 0);
}

/**
 * R24.2 — bakes combined master∘channel curves into an interleaved
 * RGBA float array (`size` vec4 entries, w = 1) for the WGSL uniform LUT.
 * Baked nodes equal the CPU evaluator exactly; the shader lerps between
 * nodes, matching piecewise-linear segments up to half-texel error.
 */
export function bakeCurveLut(
  settings: { curves?: RGBCurves },
  size: number = CURVE_LUT_SIZE
): Float32Array {
  const out = new Float32Array(size * 4);
  const curves: RGBCurves = settings.curves ?? {};
  for (let i = 0; i < size; i++) {
    const s = size === 1 ? 0 : i / (size - 1);
    out[i * 4] = evaluateCurve(curves.red, evaluateCurve(curves.master, s));
    out[i * 4 + 1] = evaluateCurve(curves.green, evaluateCurve(curves.master, s));
    out[i * 4 + 2] = evaluateCurve(curves.blue, evaluateCurve(curves.master, s));
    out[i * 4 + 3] = 1;
  }
  return out;
}
/** R24.2 — validates every supplied channel; throws instead of re-sorting. */
export function validateCurves(curves: RGBCurves): void {
  if (!curves) throw new Error('colorCurves: curves object is required');
  validatePoints(curves.master ?? [], 'master');
  validatePoints(curves.red ?? [], 'red');
  validatePoints(curves.green ?? [], 'green');
  validatePoints(curves.blue ?? [], 'blue');
}

/** R24.2 — exact piecewise-linear evaluation; clamps outside the hull. */
export function evaluateCurve(points: CurvePoint[] | undefined, x: number): number {
  if (!points || points.length === 0) return x;
  validatePoints(points, 'curve');
  if (!isFiniteNumber(x)) throw new Error('colorCurves: sample must be finite');
  if (x <= points[0].input) return points[0].output;
  const last = points[points.length - 1];
  if (x >= last.input) return last.output;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    if (x <= p1.input) {
      const t = (x - p0.input) / (p1.input - p0.input);
      return p0.output + t * (p1.output - p0.output);
    }
  }
  return last.output;
}

/** R24.2 — master first, then per-channel; absent curves pass through. */
export function applyCurvesToRgb(input: RGBColor, curves: RGBCurves): RGBColor {
  validateCurves(curves);
  const m = (v: number): number => evaluateCurve(curves.master, v);
  return {
    r: evaluateCurve(curves.red, m(input.r)),
    g: evaluateCurve(curves.green, m(input.g)),
    b: evaluateCurve(curves.blue, m(input.b)),
  };
}
