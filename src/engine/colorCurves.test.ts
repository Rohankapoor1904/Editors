import { describe, it, expect } from 'vitest';
import { validateCurves, evaluateCurve, applyCurvesToRgb, bakeCurveLut, curvesEnabled, CURVE_LUT_SIZE } from './colorCurves';

describe('R24.2 — curve validation', () => {
  it('accepts absent/empty channels as identity and rejects bad geometry', () => {
    expect(() => validateCurves({})).not.toThrow();
    expect(() => validateCurves({ master: [] })).not.toThrow();
    expect(() =>
      validateCurves({ red: [{ input: 0, output: 0 }] })
    ).toThrow();
    expect(() =>
      validateCurves({ green: [{ input: 0, output: 0 }, { input: 0.5, output: 0.4 }, { input: 0.4, output: 0.9 }] })
    ).toThrow();
    expect(() =>
      validateCurves({ blue: [{ input: 0, output: 0 }, { input: 1.2, output: 1 }] })
    ).toThrow();
    expect(() =>
      validateCurves({ master: [{ input: 0, output: -0.1 }, { input: 1, output: 1 }] })
    ).toThrow();
  });
});

describe('R24.2 — piecewise-linear evaluation', () => {
  it('reproduces authored points and midpoints exactly', () => {
    const pts = [{ input: 0, output: 0 }, { input: 0.5, output: 0.75 }, { input: 1, output: 1 }];
    expect(evaluateCurve(pts, 0)).toBe(0);
    expect(evaluateCurve(pts, 0.5)).toBe(0.75);
    expect(evaluateCurve(pts, 1)).toBe(1);
    expect(evaluateCurve(pts, 0.25)).toBeCloseTo(0.375, 12);
    expect(evaluateCurve(pts, 0.75)).toBeCloseTo(0.875, 12);
  });

  it('clamps outside the hull and passes identity through', () => {
    const pts = [{ input: 0.2, output: 0.3 }, { input: 0.8, output: 0.9 }];
    expect(evaluateCurve(pts, 0)).toBe(0.3);
    expect(evaluateCurve(pts, 1)).toBe(0.9);
    expect(evaluateCurve(undefined, 0.42)).toBe(0.42);
    expect(evaluateCurve([], 0.42)).toBe(0.42);
  });

  it('rejects non-finite samples', () => {
    expect(() => evaluateCurve([{ input: 0, output: 0 }, { input: 1, output: 1 }], NaN)).toThrow();
  });
});

describe('R24.2 — GPU baker (bakeCurveLut)', () => {
  it('bakes nodes exactly equal to the CPU evaluator', () => {
    const settings = {
      curves: {
        master: [{ input: 0, output: 0 }, { input: 0.5, output: 0.75 }, { input: 1, output: 1 }],
        red: [{ input: 0, output: 0.2 }, { input: 1, output: 1 }],
      },
    };
    expect(curvesEnabled(settings)).toBe(true);
    expect(curvesEnabled({})).toBe(false);
    expect(curvesEnabled({ curves: { master: [] } })).toBe(false);

    const baked = bakeCurveLut(settings, 9);
    expect(baked.length).toBe(9 * 4);
    // Node 4 of 9 sits at s = 0.5: master -> 0.75, red -> 0.2 + 0.75*0.8 = 0.8.
    // Baked storage is f32 (GPU upload format), so compare against the
    // f32-quantized reference rather than the f64 literal.
    expect(baked[4 * 4]).toBe(Math.fround(0.8));
    expect(baked[4 * 4 + 1]).toBeCloseTo(0.75, 12);
    expect(baked[4 * 4 + 3]).toBe(1);
    expect(bakeCurveLut(settings).length).toBe(CURVE_LUT_SIZE * 4);

    // Absent curves bake the identity ramp.
    const identity = bakeCurveLut({}, 4);
    expect(identity[0]).toBe(0);
    expect(identity[3 * 4]).toBeCloseTo(1, 12);
  });
});
describe('R24.2 — channel application order (master, then per-channel)', () => {
  it('halves via master and lifts red only via the red channel', () => {
    const out = applyCurvesToRgb(
      { r: 0.8, g: 0.8, b: 0.8 },
      {
        master: [{ input: 0, output: 0 }, { input: 1, output: 0.5 }],
        red: [{ input: 0, output: 0.2 }, { input: 1, output: 1 }],
      }
    );
    // master: 0.8 -> 0.4; red: 0.4 -> 0.2 + 0.4*(0.8/1)... linear: 0.2 + 0.4*0.8 = 0.52
    expect(out.r).toBeCloseTo(0.52, 12);
    expect(out.g).toBeCloseTo(0.4, 12);
    expect(out.b).toBeCloseTo(0.4, 12);
  });
});
