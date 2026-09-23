import { describe, it, expect } from 'vitest';
import { computeBlockMotion, interpolateFrame } from './speedWarp';
import { calculateDurationForSpeed } from './speedRamp';
import { createRational } from '../types/time';
import { LuminanceFrame } from './masking/pointTracker';

const W = 64;
const H = 64;

function frameWithSquare(sx: number, sy: number): LuminanceFrame {
  const data = new Float64Array(W * H).fill(10);
  for (let y = sy; y < sy + 16; y++) {
    for (let x = sx; x < sx + 12; x++) {
      data[y * W + x] = 200;
    }
  }
  return { width: W, height: H, data };
}

function framesEqual(a: LuminanceFrame, b: LuminanceFrame): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i++) {
    if (a.data[i] !== b.data[i]) return false;
  }
  return true;
}

/** Mean x of pixels above threshold (mass centroid). */
function centroidX(frame: LuminanceFrame, threshold: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (frame.data[y * frame.width + x] > threshold) {
        sum += x;
        count++;
      }
    }
  }
  if (count === 0) throw new Error('centroidX: no mass above threshold');
  return sum / count;
}

describe('R24.5 — SAD block motion', () => {
  it('reports the square translation and stillness for flat blocks', () => {
    // 12-wide squares straddle block edges so the true shift is the unique
    // SAD minimum (a fully interior flat block ties honestly at zero).
    const prev = frameWithSquare(20, 24);
    const curr = frameWithSquare(28, 24);
    const field = computeBlockMotion(prev, curr, 8, 12);
    expect(field.cols).toBe(8);
    expect(field.rows).toBe(8);
    // Block (2,3) covers prev x 16..23 = [bg,bg,bg,bg,sq,sq,sq,sq]:
    // only dx=8 reproduces that pattern in curr.
    const onEdge = field.vectors[3 * 8 + 2];
    expect(onEdge.dx).toBe(8);
    expect(onEdge.dy).toBe(0);
    // Corner block is flat background: honest zero, not noise.
    const corner = field.vectors[0];
    expect(corner.dx).toBe(0);
    expect(corner.dy).toBe(0);
  });

  it('rejects bad geometry instead of matching it', () => {
    const prev = frameWithSquare(16, 24);
    const small: LuminanceFrame = { width: 4, height: 4, data: new Float64Array(16) };
    expect(() => computeBlockMotion(prev, small, 8, 4)).toThrow();
    expect(() => computeBlockMotion(prev, prev, 2, 4)).toThrow();
  });
});

describe('R24.5 — motion-compensated interpolation', () => {
  it('reproduces endpoints bit-exactly (t=0 prev, t=1 curr)', () => {
    const prev = frameWithSquare(20, 24);
    const curr = frameWithSquare(28, 24);
    const field = computeBlockMotion(prev, curr, 8, 12);
    expect(framesEqual(interpolateFrame(prev, curr, field, 0), prev)).toBe(true);
    expect(framesEqual(interpolateFrame(prev, curr, field, 1), curr)).toBe(true);
  });

  it('lands the midpoint square halfway between the inputs', () => {
    const prev = frameWithSquare(20, 24);
    const curr = frameWithSquare(28, 24);
    const field = computeBlockMotion(prev, curr, 8, 12);
    const mid = interpolateFrame(prev, curr, field, 0.5);
    // True midpoint spans x 24..35, centroid 29.5.
    expect(centroidX(mid, 100)).toBeGreaterThan(28);
    expect(centroidX(mid, 100)).toBeLessThan(31);
  });

  it('rejects out-of-range phases and mismatched fields', () => {
    const prev = frameWithSquare(20, 24);
    const field = computeBlockMotion(prev, prev, 8, 4);
    expect(() => interpolateFrame(prev, prev, field, -0.1)).toThrow();
    expect(() => interpolateFrame(prev, prev, field, 1.5)).toThrow();
    expect(() => interpolateFrame(prev, prev, { ...field, cols: 2 }, 0.5)).toThrow();
  });
});

describe('R24.5 — rational slow-mo timing rides speedRamp', () => {
  it('halves speed to exactly double duration in rational time', () => {
    expect(calculateDurationForSpeed(createRational(120, 30), 0.5)).toEqual(createRational(8, 1));
  });
});
