import { describe, it, expect } from 'vitest';
import { channelStats, computeMatchGrade, computeAutoColorGrade, rgbStats } from './colorMatch';
import { colorEngine, ColorGradeSettings } from './colorEngine';
import type { RGBColor } from './colorEngine';

const NEUTRAL_GRADE: ColorGradeSettings = {
  lift: { r: 0, g: 0, b: 0 },
  gamma: { r: 1, g: 1, b: 1 },
  gain: { r: 1, g: 1, b: 1 },
  offset: { r: 0, g: 0, b: 0 },
};

describe('R24.2 — channel statistics', () => {
  it('computes exact mean/std and rejects empty or dirty input', () => {
    expect(channelStats([0, 2])).toEqual({ mean: 1, std: 1 });
    expect(() => channelStats([])).toThrow();
    expect(() => channelStats([0.5, NaN])).toThrow();
  });
});

describe('R24.2 — Reinhard match transfer', () => {
  it('maps source stats onto reference stats exactly', () => {
    const grade = computeMatchGrade(
      { r: { mean: 0.2, std: 0.1 }, g: { mean: 0.2, std: 0.1 }, b: { mean: 0.2, std: 0.1 } },
      { r: { mean: 0.5, std: 0.2 }, g: { mean: 0.5, std: 0.2 }, b: { mean: 0.5, std: 0.2 } }
    );
    expect(grade.gain.r).toBeCloseTo(2, 12);
    expect(grade.offset.r).toBeCloseTo(0.1, 12);
    // The source mean lands exactly on the reference mean.
    expect(0.2 * grade.gain.r + grade.offset.r).toBeCloseTo(0.5, 12);
  });

  it('degrades a flat channel to a mean shift instead of dividing by zero', () => {
    const grade = computeMatchGrade(
      { r: { mean: 0.3, std: 0 }, g: { mean: 0.3, std: 0.1 }, b: { mean: 0.3, std: 0.1 } },
      { r: { mean: 0.7, std: 0.4 }, g: { mean: 0.7, std: 0.1 }, b: { mean: 0.7, std: 0.1 } }
    );
    expect(grade.gain.r).toBe(1);
    expect(grade.offset.r).toBeCloseTo(0.4, 12);
    expect(Number.isFinite(grade.gain.g)).toBe(true);
  });

  it('moves real sample distributions toward the reference', () => {
    const source: RGBColor[] = [0.1, 0.15, 0.2, 0.25, 0.3].map((v) => ({ r: v, g: v, b: v }));
    const ref: RGBColor[] = [0.5, 0.55, 0.6, 0.65, 0.7].map((v) => ({ r: v, g: v, b: v }));
    const grade = computeMatchGrade(rgbStats(source), rgbStats(ref));
    const mapped = source.map((p) => p.r * grade.gain.r + grade.offset.r);
    const mappedMean = mapped.reduce((a, b) => a + b, 0) / mapped.length;
    expect(Math.abs(mappedMean - 0.6)).toBeLessThan(Math.abs(0.2 - 0.6));
    expect(mappedMean).toBeCloseTo(0.6, 12);
  });
});

describe('R24.2 — gray-world auto color', () => {
  it('cools a warm cast and warms a cool cast', () => {
    const warm: RGBColor[] = [{ r: 0.6, g: 0.5, b: 0.3 }];
    const cool: RGBColor[] = [{ r: 0.3, g: 0.5, b: 0.6 }];
    expect(computeAutoColorGrade(warm).temperature).toBeLessThan(0);
    expect(computeAutoColorGrade(cool).temperature).toBeGreaterThan(0);
  });

  it('lifts dark fixtures and proves cast reduction through the real grade path', () => {
    const warmDark: RGBColor[] = [
      { r: 0.12, g: 0.08, b: 0.04 },
      { r: 0.14, g: 0.09, b: 0.05 },
    ];
    const auto = computeAutoColorGrade(warmDark);
    expect(auto.offset.r).toBeGreaterThan(0);
    const before = warmDark[0].r - warmDark[0].b;
    const after = colorEngine.evaluateColorOnCPU(warmDark[0], {
      ...NEUTRAL_GRADE,
      temperature: auto.temperature,
      offset: auto.offset,
    });
    expect(after.r - after.b).toBeLessThan(before);
  });
});
