import { describe, it, expect } from 'vitest';
import { detectSceneCuts, frameHistogram, histChiSquare, cutTimes } from './sceneDetect';
import { createRational } from '../types/time';
import { LuminanceFrame } from './masking/pointTracker';

const W = 48;
const H = 32;

function flat(value: number): LuminanceFrame {
  return { width: W, height: H, data: new Float64Array(W * H).fill(value) };
}

function textured(seed: number): LuminanceFrame {
  const data = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      data[y * W + x] = (x * 7 + y * 13 + seed * 31) % 220 + 20;
    }
  }
  return { width: W, height: H, data };
}

describe('R24.6 — histogram cut detection', () => {
  it('splits a 3-shot flattened export at exact boundaries', () => {
    const frames = [
      ...Array.from({ length: 5 }, () => flat(30)),
      ...Array.from({ length: 5 }, () => textured(1)),
      ...Array.from({ length: 5 }, () => flat(230)),
    ];
    const cuts = detectSceneCuts(frames);
    expect(cuts.map((c) => c.frameIndex)).toEqual([5, 10]);
    for (const c of cuts) {
      expect(c.strength).toBeGreaterThan(0.25);
      expect(c.audioTransient).toBe(false);
    }
  });

  it('ignores in-shot motion and honours the minimum gap', () => {
    // Same texture drifting 1px/frame: histograms barely move.
    const drift = Array.from({ length: 8 }, (_, i) => {
      const base = textured(0);
      const out = new Float64Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          out[y * W + x] = base.data[y * W + Math.max(0, x - i)];
        }
      }
      return { width: W, height: H, data: out };
    });
    expect(detectSceneCuts(drift)).toEqual([]);

    // Two cuts one frame apart: the second is chatter, suppressed by minGap.
    const tight = [flat(30), flat(30), textured(5), flat(230), flat(230)];
    expect(detectSceneCuts(tight, { minGapFrames: 3 }).map((c) => c.frameIndex)).toEqual([2]);
  });

  it('annotates audio-transient coincidence without gating on it', () => {
    const frames = [...Array.from({ length: 4 }, () => flat(30)), ...Array.from({ length: 4 }, () => flat(230))];
    const calm = new Array(8).fill(0.1);
    const spiky = [...calm];
    spiky[4] = 5.0;
    const withoutAudio = detectSceneCuts(frames);
    expect(withoutAudio).toHaveLength(1);
    expect(withoutAudio[0].audioTransient).toBe(false);

    const withAudio = detectSceneCuts(frames, { audioEnergy: spiky });
    expect(withAudio).toHaveLength(1);
    expect(withAudio[0].frameIndex).toBe(4);
    expect(withAudio[0].audioTransient).toBe(true);
  });

  it('rejects ragged input and bad options instead of guessing', () => {
    expect(() => detectSceneCuts([flat(10)])).toThrow();
    expect(() => detectSceneCuts([])).toThrow();
    expect(() => detectSceneCuts([flat(10), { width: 8, height: 8, data: new Float64Array(64) }])).toThrow();
    expect(() => detectSceneCuts([flat(10), flat(20)], { threshold: 0 })).toThrow();
    expect(() => detectSceneCuts([flat(10), flat(20)], { audioEnergy: [0.1] })).toThrow();
  });

  it('pins histogram math: identical frames score 0, disjoint score 1', () => {
    const a = frameHistogram(flat(30));
    expect(histChiSquare(a, frameHistogram(flat(30)))).toBe(0);
    expect(histChiSquare(a, frameHistogram(flat(230)))).toBeCloseTo(1, 12);
    expect(() => frameHistogram(flat(1), 1)).toThrow();
  });

  it('maps cuts to exact rational split times for SplitCommand stepping', () => {
    const times = cutTimes([{ frameIndex: 5, strength: 0.9, audioTransient: false }], 30);
    expect(times).toEqual([createRational(5, 30)]);
    expect(() => cutTimes([{ frameIndex: 0, strength: 1, audioTransient: false }], 30)).toThrow();
    expect(() => cutTimes([{ frameIndex: 5, strength: 1, audioTransient: false }], 0)).toThrow();
  });
});
