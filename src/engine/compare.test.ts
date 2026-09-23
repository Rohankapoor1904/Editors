import { describe, it, expect } from 'vitest';
import { renderComparison, PixelBuffer } from './compare';
import { ColorGradeSettings } from './colorEngine';

const LIFTED: ColorGradeSettings = {
  lift: { r: 0.2, g: 0, b: 0 },
  gamma: { r: 1, g: 1, b: 1 },
  gain: { r: 1, g: 1, b: 1 },
  offset: { r: 0, g: 0, b: 0 },
};

function grayFrame(): PixelBuffer {
  const data = new Uint8ClampedArray(4 * 2 * 4);
  for (let i = 0; i < 8; i++) {
    data[i * 4] = 100;
    data[i * 4 + 1] = 100;
    data[i * 4 + 2] = 100;
    data[i * 4 + 3] = 255;
  }
  return { width: 4, height: 2, data };
}

describe('R26.3 — comparison rendering', () => {
  it('grades each side independently (100 -> 151 red on the graded side)', () => {
    const { left, right } = renderComparison(grayFrame(), LIFTED, null, 'side-by-side');
    expect(left.data[0]).toBe(151);
    expect(left.data[1]).toBe(100);
    expect(right.data[0]).toBe(100);
  });

  it('splits A left and B right at the wipe position', () => {
    const { left } = renderComparison(grayFrame(), LIFTED, null, 'split', 0.5);
    // x=0,1 graded; x=2,3 bypassed.
    expect(left.data[0]).toBe(151);
    expect(left.data[3 * 4]).toBe(100);
    expect(() => renderComparison(grayFrame(), LIFTED, null, 'split', 2)).toThrow();
    expect(() => renderComparison(grayFrame(), LIFTED, null, 'nope' as never)).toThrow();
  });

  it('proves no grade cross-talk: B never sees A', () => {
    const frame = grayFrame();
    const first = renderComparison(frame, LIFTED, null, 'side-by-side');
    // Mutating the A grade afterwards cannot reach the rendered B.
    const second = renderComparison(frame, null, null, 'side-by-side');
    expect(first.right.data).toEqual(second.right.data);
    // Input buffer untouched by either render.
    expect(frame.data[0]).toBe(100);
  });
});
