import { describe, it, expect } from 'vitest';
import { ClipMask } from '../../../types/timeline';
import { validateMask, maskAlphaAt, rectIoU } from '../maskTypes';
import { LuminanceFrame, trackPoint } from '../pointTracker';
import { propagateMask, detectSubjectMask } from '../maskTracker';
import { applyMaskedGradeToImage } from '../applyMaskedGrade';
import { NotImplementedError } from '../../../services/runtimeConfig';

function baseMask(overrides: Partial<ClipMask> = {}): ClipMask {
  return {
    id: 'mask-1',
    shape: 'rect',
    subjectClass: 'person',
    centerX: 0.5,
    centerY: 0.5,
    sizeX: 0.5,
    sizeY: 0.5,
    ...overrides,
  };
}

function makeFrame(width: number, height: number, fill: number): LuminanceFrame {
  const data = new Float64Array(width * height).fill(fill);
  return { width, height, data };
}

function drawSquare(frame: LuminanceFrame, x0: number, y0: number, size: number, value: number): void {
  const data = frame.data as Float64Array;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      data[y * frame.width + x] = value;
    }
  }
}

describe('R24.1 — mask model validation', () => {
  it('accepts a well-formed mask', () => {
    expect(() => validateMask(baseMask())).not.toThrow();
  });

  it('rejects out-of-range geometry instead of clamping it', () => {
    expect(() => validateMask(baseMask({ centerX: 1.5 }))).toThrow();
    expect(() => validateMask(baseMask({ sizeX: 0 }))).toThrow();
    expect(() => validateMask(baseMask({ sizeY: 2 }))).toThrow();
    expect(() => validateMask(baseMask({ feather: -0.1 }))).toThrow();
    expect(() => validateMask(baseMask({ shape: 'polygon' as never }))).toThrow();
    expect(() => validateMask(baseMask({ id: '' }))).toThrow();
  });
});

describe('R24.1 — mask alpha coverage', () => {
  it('covers the rect interior and nothing outside (hard edge)', () => {
    const mask = baseMask(); // [0.25,0.75]^2
    expect(maskAlphaAt(mask, 0.5, 0.5)).toBe(1);
    expect(maskAlphaAt(mask, 0.26, 0.74)).toBe(1);
    expect(maskAlphaAt(mask, 0.1, 0.5)).toBe(0);
    expect(maskAlphaAt(mask, 0.5, 0.9)).toBe(0);
  });

  it('covers the ellipse interior along its axes', () => {
    const mask = baseMask({ shape: 'ellipse' });
    expect(maskAlphaAt(mask, 0.5, 0.5)).toBe(1);
    expect(maskAlphaAt(mask, 0.7, 0.5)).toBe(1);
    expect(maskAlphaAt(mask, 0.5, 0.7)).toBe(1);
    expect(maskAlphaAt(mask, 0.7, 0.7)).toBe(0);
  });

  it('honours a 90-degree rotation by swapping the rect axes', () => {
    const wide = baseMask({ centerX: 0.5, centerY: 0.5, sizeX: 0.6, sizeY: 0.2 });
    expect(maskAlphaAt(wide, 0.7, 0.5)).toBe(1);
    expect(maskAlphaAt(wide, 0.5, 0.7)).toBe(0);
    const rotated = baseMask({ centerX: 0.5, centerY: 0.5, sizeX: 0.6, sizeY: 0.2, rotation: Math.PI / 2 });
    expect(maskAlphaAt(rotated, 0.7, 0.5)).toBe(0);
    expect(maskAlphaAt(rotated, 0.5, 0.7)).toBe(1);
  });

  it('inverts coverage when invert is set', () => {
    const mask = baseMask({ invert: true });
    expect(maskAlphaAt(mask, 0.5, 0.5)).toBe(0);
    expect(maskAlphaAt(mask, 0.1, 0.1)).toBe(1);
  });

  it('feathers the rect edge into a strict (0,1) transition', () => {
    const mask = baseMask({ feather: 0.5 });
    const deepInside = maskAlphaAt(mask, 0.5, 0.5);
    const edge = maskAlphaAt(mask, 0.749, 0.5);
    const outside = maskAlphaAt(mask, 0.9, 0.5);
    expect(deepInside).toBe(1);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(1);
    expect(outside).toBe(0);
  });
});

describe('R24.1 — rect IoU scoring', () => {
  it('scores identical, half-overlap, disjoint and degenerate rects exactly', () => {
    expect(rectIoU({ x: 0, y: 0, w: 2, h: 2 }, { x: 0, y: 0, w: 2, h: 2 })).toBe(1);
    expect(rectIoU({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 0, w: 2, h: 2 })).toBeCloseTo(1 / 3, 12);
    expect(rectIoU({ x: 0, y: 0, w: 1, h: 1 }, { x: 5, y: 5, w: 1, h: 1 })).toBe(0);
    expect(rectIoU({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(0);
  });
});

describe('R24.1 — NCC point tracker on synthetic fixtures', () => {
  it('recovers an exact integer translation with near-perfect score', () => {
    const prev = makeFrame(64, 64, 10);
    const curr = makeFrame(64, 64, 10);
    drawSquare(prev, 20, 20, 16, 200);
    drawSquare(curr, 25, 22, 16, 200);
    const result = trackPoint(prev, curr, 28, 28);
    expect(result.x).toBe(33);
    expect(result.y).toBe(30);
    expect(result.score).toBeGreaterThan(0.999);
  });

  it('reports zero displacement with score 1 on identical frames', () => {
    const prev = makeFrame(64, 64, 10);
    drawSquare(prev, 20, 20, 16, 200);
    const curr = makeFrame(64, 64, 10);
    drawSquare(curr, 20, 20, 16, 200);
    const result = trackPoint(prev, curr, 28, 28);
    expect(result.x).toBe(28);
    expect(result.y).toBe(28);
    expect(result.score).toBeGreaterThan(0.999999);
  });

  it('throws instead of guessing on unusable input', () => {
    const frame = makeFrame(64, 64, 10);
    drawSquare(frame, 20, 20, 16, 200);
    const same = makeFrame(64, 64, 10);
    drawSquare(same, 20, 20, 16, 200);
    // Seed too close to the border for the template.
    expect(() => trackPoint(frame, same, 2, 2)).toThrow();
    // Featureless template: zero variance, nothing to match.
    const flatA = makeFrame(32, 32, 128);
    const flatB = makeFrame(32, 32, 128);
    expect(() => trackPoint(flatA, flatB, 16, 16, 4, 8)).toThrow();
    // Dimension mismatch.
    const small = makeFrame(16, 16, 10);
    expect(() => trackPoint(frame, small, 28, 28)).toThrow();
  });
});

describe('R24.1 — mask propagation across a frame pair', () => {
  it('translates the centroid by the measured shift and keeps shape/size', () => {
    const prev = makeFrame(64, 64, 10);
    const curr = makeFrame(64, 64, 10);
    drawSquare(prev, 20, 20, 16, 200);
    drawSquare(curr, 25, 22, 16, 200);
    const mask = baseMask({ centerX: 28 / 64, centerY: 28 / 64, sizeX: 0.25, sizeY: 0.25 });
    const { mask: next, confidence } = propagateMask(mask, prev, curr, 64, 64);
    expect(Math.abs(next.centerX - 33 / 64)).toBeLessThan(0.01);
    expect(Math.abs(next.centerY - 30 / 64)).toBeLessThan(0.01);
    expect(next.shape).toBe('rect');
    expect(next.sizeX).toBe(0.25);
    expect(next.sizeY).toBe(0.25);
    expect(confidence).toBeGreaterThan(0.999);
  });
});

describe('R24.1 — neural auto-detect honesty', () => {
  it('throws NotImplementedError: no segmentation model is bundled', () => {
    expect(() => detectSubjectMask()).toThrowError(NotImplementedError);
  });
});

describe('R24.1 — masked grade reference (CPU oracle)', () => {
  const settings = {
    lift: { r: 0.2, g: 0, b: 0 },
    gamma: { r: 1, g: 1, b: 1 },
    gain: { r: 1, g: 1, b: 1 },
    offset: { r: 0, g: 0, b: 0 },
  };

  function grayImage(): { width: number; height: number; data: Uint8ClampedArray } {
    const width = 4;
    const height = 2;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 100;
      data[i + 1] = 100;
      data[i + 2] = 100;
      data[i + 3] = 255;
    }
    return { width, height, data };
  }

  it('grades inside the mask only and never mutates the input', () => {
    const image = grayImage();
    // Covers normalized x in [0, 0.5): pixel columns 0 and 1.
    const mask = baseMask({ centerX: 0.25, centerY: 0.5, sizeX: 0.5, sizeY: 1.0 });
    const out = applyMaskedGradeToImage(image, mask, settings);
    // 100/255 red + 0.2 lift -> 151; green/blue untouched.
    expect(out.data[0]).toBe(151);
    expect(out.data[1]).toBe(100);
    const right = 3 * 4; // pixel column 3, row 0
    expect(out.data[right]).toBe(100);
    // Input buffer is intact (non-destructive model).
    expect(image.data[0]).toBe(100);
  });

  it('grades outside the mask when invert is set', () => {
    const image = grayImage();
    const mask = baseMask({ centerX: 0.25, centerY: 0.5, sizeX: 0.5, sizeY: 1.0, invert: true });
    const out = applyMaskedGradeToImage(image, mask, settings);
    expect(out.data[0]).toBe(100);
    const right = 3 * 4;
    expect(out.data[right]).toBe(151);
  });
});
