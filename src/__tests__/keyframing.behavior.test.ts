import { describe, it, expect } from 'vitest';
import { solveCubicBezier, evaluateEasing, interpolateKeyframeValue } from '../utils/keyframing';
import { secondsToRational } from '../types/time';
import type { Keyframe } from '../types/timeline';

/**
 * Behavioural guard for the cubic Bezier keyframe interpolator.
 *
 * `scripts/verify-invariants.mjs` only asserts that the *identifier* `solveCubicBezier`
 * appears in `keyframing.ts`. A stub that returns `x` unchanged, or a hardcoded constant,
 * satisfies that substring check while doing no curve evaluation at all. That gap is how
 * docs/GAP_ANALYSIS.md came to claim the interpolator was "linear only" while a working
 * Newton-Raphson solver was already present, and how the reverse (a doc claiming "real"
 * over a stubbed body) could pass unnoticed.
 *
 * These assertions pin the actual curve output, so any substitution of a linear or
 * constant body fails immediately.
 */

// Reference values are the mathematically exact unit-Bezier outputs (CSS timing function
// definition), independent of the solver used. Bisection and Newton-Raphson agree to ~1e-6,
// so 4 decimal places is tight enough to reject a stub but stable across valid solvers.
describe('solveCubicBezier — real curve evaluation', () => {
  it('reproduces the CSS ease-in curve, not the identity', () => {
    // linear would give 0.5 here; the real ease-in curve gives ~0.315357
    const y = solveCubicBezier(0.42, 0, 1, 1, 0.5);
    expect(y).toBeCloseTo(0.315357, 4);
    expect(y).not.toBeCloseTo(0.5, 2);
  });

  it('reproduces the CSS ease-out curve, not the identity', () => {
    const y = solveCubicBezier(0, 0, 0.58, 1, 0.5);
    expect(y).toBeCloseTo(0.684643, 4);
    expect(y).not.toBeCloseTo(0.5, 2);
  });

  it('reproduces the CSS ease-in-out curve', () => {
    expect(solveCubicBezier(0.42, 0, 0.58, 1, 0.25)).toBeCloseTo(0.129162, 4);
  });

  it('keeps the identity only for genuinely linear control points', () => {
    // The linear fast-path must be exactly the identity...
    expect(solveCubicBezier(0, 0, 1, 1, 0.25)).toBeCloseTo(0.25, 6);
    // ...but must not be reached for non-linear presets.
    expect(solveCubicBezier(0.42, 0, 1, 1, 0.25)).not.toBeCloseTo(0.25, 2);
  });

  it('is strictly monotonic across the unit interval for each preset', () => {
    const presets: Array<[number, number, number, number]> = [
      [0.42, 0, 1, 1],
      [0, 0, 0.58, 1],
      [0.42, 0, 0.58, 1],
      [0.25, 0.1, 0.25, 1],
    ];
    for (const [x1, y1, x2, y2] of presets) {
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const y = solveCubicBezier(x1, y1, x2, y2, i / 20);
        expect(y).toBeGreaterThanOrEqual(prev);
        prev = y;
      }
    }
  });

  it('clamps the domain to [0, 1]', () => {
    expect(solveCubicBezier(0.42, 0, 1, 1, -0.5)).toBe(0);
    expect(solveCubicBezier(0.42, 0, 1, 1, 1.5)).toBe(1);
    expect(solveCubicBezier(0.42, 0, 1, 1, 0)).toBe(0);
    expect(solveCubicBezier(0.42, 0, 1, 1, 1)).toBe(1);
  });
});

describe('evaluateEasing — preset and CSS-string dispatch', () => {
  it('passes progress through unchanged for linear', () => {
    expect(evaluateEasing('linear', 0.5)).toBe(0.5);
    expect(evaluateEasing(undefined, 0.37)).toBe(0.37);
  });

  it('evaluates named presets as real curves', () => {
    expect(evaluateEasing('ease-in', 0.5)).toBeCloseTo(0.315357, 4);
    expect(evaluateEasing('ease-out', 0.5)).toBeCloseTo(0.684643, 4);
  });

  it('parses a CSS cubic-bezier() string into a real curve', () => {
    const y = evaluateEasing('cubic-bezier(0.42, 0, 1, 1)', 0.5);
    expect(y).toBeCloseTo(0.315357, 4);
    expect(y).not.toBeCloseTo(0.5, 2);
  });
});

describe('interpolateKeyframeValue — easing is read, not ignored', () => {
  const keys = (easing: string): Keyframe[] => [
    { time: secondsToRational(0), value: 0, easing },
    { time: secondsToRational(10), value: 100, easing },
  ];

  it('accelerates below the linear midpoint for ease-in', () => {
    expect(interpolateKeyframeValue(keys('ease-in'), secondsToRational(5))).toBeCloseTo(31.5357, 2);
  });

  it('decelerates above the linear midpoint for ease-out', () => {
    expect(interpolateKeyframeValue(keys('ease-out'), secondsToRational(5))).toBeCloseTo(68.4643, 2);
  });

  it('produces different values for different easings at the same time', () => {
    const at = secondsToRational(5);
    const easeIn = interpolateKeyframeValue(keys('ease-in'), at);
    const easeOut = interpolateKeyframeValue(keys('ease-out'), at);
    const linear = interpolateKeyframeValue(keys('linear'), at);
    expect(easeIn).toBeLessThan(linear);
    expect(easeOut).toBeGreaterThan(linear);
  });

  it('remains linear in time when no easing is declared', () => {
    const plain: Keyframe[] = [
      { time: secondsToRational(0), value: 0 },
      { time: secondsToRational(10), value: 100 },
    ];
    expect(interpolateKeyframeValue(plain, secondsToRational(5))).toBeCloseTo(50, 6);
  });

  it('holds the terminal values outside the keyframe range', () => {
    const k = keys('ease-in');
    expect(interpolateKeyframeValue(k, secondsToRational(-1))).toBe(0);
    expect(interpolateKeyframeValue(k, secondsToRational(11))).toBe(100);
  });
});