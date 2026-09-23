import { describe, it, expect } from 'vitest';
import { estimateFrameShifts, integratePath, smoothPath, stabilizeFrames } from './stabilizer';
import { LuminanceFrame } from './masking/pointTracker';

const W = 64;
const H = 64;

/** 2D-textured base: diagonal gradient (unique NCC everywhere) + one square. */
function baseFrame(): LuminanceFrame {
  const data = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      data[y * W + x] = (x * 3 + y * 5) % 200 + 20;
    }
  }
  for (let y = 28; y < 38; y++) {
    for (let x = 28; x < 38; x++) {
      data[y * W + x] = 240;
    }
  }
  return { width: W, height: H, data };
}

function translate(frame: LuminanceFrame, dx: number, dy: number): LuminanceFrame {
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = Math.max(0, Math.min(W - 1, x - dx));
      const sy = Math.max(0, Math.min(H - 1, y - dy));
      out[y * W + x] = frame.data[sy * W + sx];
    }
  }
  return { width: W, height: H, data: out };
}

// Cumulative camera path; pairwise truths derived by differencing.
const PATH = [
  { x: 0, y: 0 },
  { x: 3, y: -2 },
  { x: 2, y: 2 },
  { x: 7, y: 3 },
  { x: 4, y: 0 },
];

function jitteredFrames(): LuminanceFrame[] {
  const base = baseFrame();
  return PATH.map((p) => translate(base, p.x, p.y));
}

describe('R24.5 — NCC grid motion estimation', () => {
  it('recovers exact integer pairwise shifts on a textured fixture', () => {
    const shifts = estimateFrameShifts(jitteredFrames());
    expect(shifts).toHaveLength(PATH.length - 1);
    const truth = [
      { dx: 3, dy: -2 },
      { dx: -1, dy: 4 },
      { dx: 5, dy: 1 },
      { dx: -3, dy: -3 },
    ];
    shifts.forEach((s, i) => {
      expect(s.dx).toBe(truth[i].dx);
      expect(s.dy).toBe(truth[i].dy);
      expect(s.coverage).toBeGreaterThan(0.5);
      expect(s.confidence).toBeGreaterThan(0.99);
    });
  });

  it('fails loudly on unusable input instead of inventing motion', () => {
    const flat = (): LuminanceFrame => ({ width: W, height: H, data: new Float64Array(W * H).fill(50) });
    expect(() => estimateFrameShifts([baseFrame()])).toThrow();
    expect(() => estimateFrameShifts([flat(), flat()])).toThrow();
    expect(() => estimateFrameShifts([baseFrame(), { width: 32, height: 32, data: new Float64Array(1024) }])).toThrow();
    expect(() => estimateFrameShifts(jitteredFrames(), { gridSize: 1 })).toThrow();
  });
});

describe('R24.5 — path smoothing and correction', () => {
  it('attenuates an impulse spike while preserving endpoints trend', () => {
    const spiky = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    const smooth = smoothPath(spiky, 1);
    expect(smooth[2].x).toBeLessThan(10);
    expect(smooth[2].x).toBeGreaterThan(0);
    expect(smoothPath(spiky, 0)).toEqual(spiky);
    expect(() => smoothPath([], 2)).toThrow();
  });

  it('re-anchors every frame exactly onto the smoothed path (energy to zero)', () => {
    const { path, smooth, corrections } = stabilizeFrames(jitteredFrames());
    expect(integratePath(estimateFrameShifts(jitteredFrames()))).toEqual(path);
    let jitterEnergy = 0;
    let residualEnergy = 0;
    for (let i = 0; i < path.length; i++) {
      // Corrected position reproduces the smooth path exactly.
      expect(path[i].x + corrections[i].dx).toBeCloseTo(smooth[i].x, 12);
      expect(path[i].y + corrections[i].dy).toBeCloseTo(smooth[i].y, 12);
      if (i > 0) {
        jitterEnergy += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
        const rx = path[i].x + corrections[i].dx - (smooth[i].x);
        const ry = path[i].y + corrections[i].dy - (smooth[i].y);
        residualEnergy += Math.abs(rx) + Math.abs(ry);
      }
    }
    expect(jitterEnergy).toBeGreaterThan(0);
    // Moving-average division leaves f64 dust: pin a tight band, not exact 0.
    expect(residualEnergy).toBeLessThan(1e-9);
  });
});
