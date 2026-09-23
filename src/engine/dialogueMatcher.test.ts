import { describe, it, expect } from 'vitest';
import { levelOffsetDb, matchTone, deltasToEqBands, bandLevelsDb } from './dialogueMatcher';

const CENTERS = [100, 1000, 8000];

describe('R24.3 — level matching', () => {
  it('computes exact dB offsets and guards its inputs', () => {
    expect(levelOffsetDb(0.5, 1.0)).toBeCloseTo(6.0206, 3);
    expect(levelOffsetDb(1.0, 1.0)).toBe(0);
    expect(levelOffsetDb(0.01, 10)).toBe(24); // clamped, not +60
    expect(() => levelOffsetDb(0, 1)).toThrow();
    expect(() => levelOffsetDb(-1, 1)).toThrow();
  });
});

describe('R24.3 — tone transfer', () => {
  it('transfers a tilted reference with exact smoothed deltas', () => {
    const deltas = matchTone([0, 0, 0], [6, 0, -6], CENTERS);
    expect(deltas.map((d) => d.centerHz)).toEqual(CENTERS);
    // [0.25*6 + 0.5*6, 0.25*6 - 0.25*6, -0.25*6*... ] smoothed kernel values:
    expect(deltas[0].gainDb).toBeCloseTo(4.5, 12);
    expect(deltas[1].gainDb).toBeCloseTo(0, 12);
    expect(deltas[2].gainDb).toBeCloseTo(-4.5, 12);
  });

  it('pins raw transfer with smoothing disabled and clamps extremes', () => {
    const raw = matchTone([0, 0, 0], [6, 0, -6], CENTERS, 12, false);
    expect(raw.map((d) => d.gainDb)).toEqual([6, 0, -6]);
    const capped = matchTone([0], [30], [100], 12, false);
    expect(capped[0].gainDb).toBe(12);
  });

  it('moves the target distribution onto the reference', () => {
    const deltas = matchTone([0, 0, 0], [6, 0, -6], CENTERS);
    const corrected = [0, 0, 0].map((t, i) => t + deltas[i].gainDb);
    const before = [6, 0, -6].reduce((a, b) => a + b * b, 0);
    const after = [6, 0, -6].map((r, i) => r - corrected[i]).reduce((a, b) => a + b * b, 0);
    expect(after).toBeLessThan(before);
  });

  it('rejects ragged or empty input instead of misaligning bands', () => {
    expect(() => matchTone([], [], [])).toThrow();
    expect(() => matchTone([0, 0], [0], CENTERS)).toThrow();
    expect(() => matchTone([0, NaN, 0], [0, 0, 0], CENTERS)).toThrow();
  });
});

describe('R24.3 remainder — Goertzel band analysis', () => {
  it('reads coherent two-tone levels with exact dBFS values', () => {
    const sr = 44100;
    const n = 4410; // 0.1s: 1000 Hz -> exactly 100 cycles, 3000 Hz -> 300
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] =
        0.5 * Math.sin((2 * Math.PI * 1000 * i) / sr) +
        0.25 * Math.sin((2 * Math.PI * 3000 * i) / sr);
    }
    const levels = bandLevelsDb(samples, sr, [1000, 3000]);
    expect(levels[0]).toBeCloseTo(20 * Math.log10(0.5), 0);
    expect(levels[1]).toBeCloseTo(20 * Math.log10(0.25), 0);
  });

  it('rejects bad inputs instead of returning bins', () => {
    const ok = new Float32Array(256).fill(0.1);
    expect(() => bandLevelsDb(new Float32Array(0), 44100, [1000])).toThrow();
    expect(() => bandLevelsDb(ok, 0, [1000])).toThrow();
    expect(() => bandLevelsDb(ok, 44100, [])).toThrow();
    expect(() => bandLevelsDb(ok, 44100, [30000])).toThrow();
  });
});

describe('R24.3 — delta to EQ conversion', () => {
  it('emits peaking bands and rejects bad centers', () => {
    const bands = deltasToEqBands([{ centerHz: 1000, gainDb: 3 }]);
    expect(bands).toEqual([{ frequency: 1000, gainDb: 3, q: 1.0, type: 'peaking' }]);
    expect(() => deltasToEqBands([{ centerHz: -5, gainDb: 3 }])).toThrow();
  });
});
