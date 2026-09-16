import { describe, it, expect } from 'vitest';
import { createRational, addRational, compareRational } from '../types/time';

describe('RationalTime', () => {
  it('zero drift sequentially adding 1/59.94s', () => {
    // 59.94 fps is typically 60000 / 1001
    const frameRate = 60000;
    const timePerFrame = createRational(1001, frameRate);

    let rationalAccumulator = createRational(0, frameRate);
    let floatAccumulator = 0;

    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
      rationalAccumulator = addRational(rationalAccumulator, timePerFrame);
      floatAccumulator += (1001 / 60000);
    }

    // Expected exact value: 1000 * 1001 / 60000
    // Simplified rational: 1001000 / 60000 = 1001 / 60
    const expectedRational = createRational(1001 * iterations, frameRate);

    // Rational addition should be completely exact (though it might need reduction, our compare should handle it)
    expect(compareRational(rationalAccumulator, expectedRational)).toBe(0);

    // Float arithmetic will drift. We will prove it fails by showing the accumulated float
    // is not exactly equal to the mathematically perfect value.
    const exactFloat = (1001 * iterations) / 60000;
    // We expect it to drift, i.e., floatAccumulator !== exactFloat
    // (Due to JS precision, adding 1001/60000 1000 times will drift)
    expect(floatAccumulator).not.toBe(exactFloat);
  });
});
