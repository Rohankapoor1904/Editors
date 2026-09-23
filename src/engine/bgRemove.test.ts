import { describe, it, expect } from 'vitest';
import {
  chromaMatte,
  differenceMatte,
  refineMatte,
  compositeOver,
  neuralSegment,
  RgbaImage,
} from './bgRemove';

function solid(width: number, height: number, r: number, g: number, b: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Green screen with a red subject disc in the middle. */
function portrait(): RgbaImage {
  const W = 32;
  const H = 32;
  const img = solid(W, H, 0, 200, 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - 16;
      const dy = y - 16;
      if (dx * dx + dy * dy <= 64) {
        const i = (y * W + x) * 4;
        img.data[i] = 200;
        img.data[i + 1] = 30;
        img.data[i + 2] = 30;
      }
    }
  }
  return img;
}

describe('R25.5 — chroma key matting', () => {
  it('keys green to zero and keeps red at one', () => {
    const img = portrait();
    const alpha = chromaMatte(img, { keyColor: { r: 0, g: 200 / 255, b: 0 }, similarity: 0.1, smoothness: 0.05 });
    // Corner background: fully removed.
    expect(alpha[0]).toBe(0);
    expect(alpha[31]).toBe(0);
    // Disc center: fully kept.
    expect(alpha[16 * 32 + 16]).toBe(1);
    // Matte is non-empty and mostly decisive (soft only on the rim).
    let kept = 0;
    let soft = 0;
    for (const a of alpha) {
      if (a > 0.99) kept++;
      else if (a > 0.01) soft++;
    }
    expect(kept).toBeGreaterThan(100);
    expect(soft).toBeLessThan(kept);
  });

  it('rejects bad params instead of keying garbage', () => {
    const img = solid(4, 4, 0, 200, 0);
    expect(() =>
      chromaMatte(img, { keyColor: { r: 0, g: 1, b: 0 }, similarity: 2, smoothness: 0 })
    ).toThrow();
    expect(() => chromaMatte({ width: 0, height: 4, data: new Uint8ClampedArray(0) }, {
      keyColor: { r: 0, g: 1, b: 0 }, similarity: 0.1, smoothness: 0,
    })).toThrow();
  });
});

describe('R25.5 — difference matting', () => {
  it('extracts a moved subject against a learned plate', () => {
    const plate = solid(16, 16, 40, 40, 40);
    const frame = solid(16, 16, 40, 40, 40);
    for (let y = 4; y < 12; y++) {
      for (let x = 4; x < 12; x++) {
        const i = (y * 16 + x) * 4;
        frame.data[i] = 200;
        frame.data[i + 1] = 200;
        frame.data[i + 2] = 200;
      }
    }
    const alpha = differenceMatte(frame, plate, { threshold: 0.1, softness: 0.05 });
    expect(alpha[0]).toBe(0);
    expect(alpha[8 * 16 + 8]).toBe(1);
  });

  it('refuses mismatched plates', () => {
    expect(() =>
      differenceMatte(solid(8, 8, 0, 0, 0), solid(4, 4, 0, 0, 0), { threshold: 0.1 })
    ).toThrow();
  });
});

describe('R25.5 — matte refinement', () => {
  it('kills isolated specks while preserving solid regions', () => {
    const W = 8;
    const H = 8;
    const alpha = new Float32Array(W * H).fill(1);
    alpha[0] = 1; // corner stays (neighbours keep it)
    alpha[3 * W + 3] = 0; // hole inside solid region
    alpha[7 * W + 7] = 1;
    // Single isolated speck far from mass:
    const speck = new Float32Array(W * H).fill(0);
    speck[4 * W + 4] = 1;
    const cleaned = refineMatte(speck, W, H, { despecklePasses: 1 });
    expect(cleaned[4 * W + 4]).toBe(0);

    // The interior hole heals by majority vote.
    const healed = refineMatte(alpha, W, H, { despecklePasses: 1 });
    expect(healed[3 * W + 3]).toBe(1);
    expect(healed[0]).toBe(1);

    const kept = refineMatte(alpha, W, H, { despecklePasses: 0 });
    expect(kept[0]).toBe(1);
    expect(() => refineMatte(new Float32Array(4), W, H)).toThrow();
  });
});

describe('R25.5 — compositing and disable-restore', () => {
  it('lays the subject over a custom background exactly', () => {
    const fg = portrait();
    const bg = solid(32, 32, 20, 20, 120);
    const alpha = chromaMatte(fg, { keyColor: { r: 0, g: 200 / 255, b: 0 }, similarity: 0.1, smoothness: 0 });
    const out = compositeOver(fg, alpha, bg);
    // Subject center: foreground red.
    expect(out.data[(16 * 32 + 16) * 4]).toBe(200);
    // Cleared corner: background blue.
    const c = 0;
    expect(out.data[c]).toBe(20);
    expect(out.data[c + 2]).toBe(120);
  });

  it('an all-ones matte reproduces the input bit-exactly (disable restores)', () => {
    const fg = portrait();
    const ones = new Float32Array(32 * 32).fill(1);
    const out = compositeOver(fg, ones, solid(32, 32, 0, 0, 0));
    expect(out.data).toEqual(fg.data);
  });
});

describe('R25.5 — neural honesty', () => {
  it('throws instead of segmenting without a model', () => {
    expect(() => neuralSegment()).toThrow(/no model bundled/);
  });
});
