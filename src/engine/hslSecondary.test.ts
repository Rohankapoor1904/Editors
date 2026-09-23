import { describe, it, expect } from 'vitest';
import {
  rgbToHsl,
  validateSecondarySelection,
  secondaryWeight,
  applySecondaryGrade,
  HSLSecondarySelection,
} from './hslSecondary';

function redSelection(overrides: Partial<HSLSecondarySelection> = {}): HSLSecondarySelection {
  return {
    hueCenter: 0,
    hueWidth: 0.1,
    hueSoftness: 0.02,
    satMin: 0.5,
    satMax: 1,
    lumaMin: 0,
    lumaMax: 1,
    boxSoftness: 0.05,
    ...overrides,
  };
}

describe('R24.2 — RGB to HSL reference points', () => {
  it('converts primaries and neutrals exactly', () => {
    const red = rgbToHsl(1, 0, 0);
    expect(red.h).toBeCloseTo(0, 12);
    expect(red.s).toBeCloseTo(1, 12);
    expect(red.l).toBeCloseTo(0.5, 12);
    const gray = rgbToHsl(0.4, 0.4, 0.4);
    expect(gray.s).toBe(0);
    expect(gray.l).toBeCloseTo(0.4, 12);
    expect(() => rgbToHsl(NaN, 0, 0)).toThrow();
  });
});

describe('R24.2 — secondary qualifier weight', () => {
  it('selects red fully and rejects blue and gray', () => {
    const sel = redSelection();
    expect(secondaryWeight({ r: 1, g: 0, b: 0 }, sel)).toBe(1);
    expect(secondaryWeight({ r: 0, g: 0, b: 1 }, sel)).toBe(0);
    expect(secondaryWeight({ r: 0.5, g: 0.5, b: 0.5 }, sel)).toBe(0);
  });

  it('wraps the hue seam: a center near 1 still selects red', () => {
    const sel = redSelection({ hueCenter: 0.97, hueWidth: 0.1, hueSoftness: 0 });
    expect(secondaryWeight({ r: 1, g: 0, b: 0 }, sel)).toBe(1);
  });

  it('treats hard-box edges as inclusive', () => {
    const sel = redSelection({ hueSoftness: 0, boxSoftness: 0 });
    // s = 1 exactly on satMax, hue exactly on center: fully selected.
    expect(secondaryWeight({ r: 1, g: 0, b: 0 }, sel)).toBe(1);
    expect(secondaryWeight({ r: 0, g: 0, b: 1 }, sel)).toBe(0);
  });

  it('feathers the gate into a strict (0,1) transition', () => {
    const sel = redSelection({ hueCenter: 0, hueWidth: 0.04, hueSoftness: 0.2 });
    // Orange sits just outside the hard gate but inside the soft band.
    const w = secondaryWeight({ r: 1, g: 0.25, b: 0 }, sel);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
  });

  it('rejects degenerate qualifiers instead of guessing', () => {
    expect(() => validateSecondarySelection(redSelection({ hueWidth: 0 }))).toThrow();
    expect(() => validateSecondarySelection(redSelection({ satMin: 0.9, satMax: 0.1 }))).toThrow();
    expect(() => validateSecondarySelection(redSelection({ boxSoftness: 2 }))).toThrow();
  });
});

describe('R24.2 — isolated secondary grade', () => {
  it('grades selected pixels and leaves rejected pixels bit-identical', () => {
    const sel = redSelection();
    const grade = { lift: { r: 0.1, g: 0, b: 0 }, gain: { r: 2, g: 1, b: 1 } };
    const graded = applySecondaryGrade({ r: 0.2, g: 0, b: 0 }, sel, grade);
    expect(graded.r).toBeCloseTo(0.6, 12);
    expect(graded.g).toBe(0);
    const untouched = applySecondaryGrade({ r: 0, g: 0, b: 0.2 }, sel, grade);
    expect(untouched).toEqual({ r: 0, g: 0, b: 0.2 });
  });
});
