import { describe, it, expect } from 'vitest';
import {
  applyCompressor,
  applyDeesser,
  compressorNodeConfig,
  validateCompressorSettings,
} from './dynamics';

const SR = 44100;

function sine(freqHz: number, seconds: number, amplitude: number): Float32Array {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / SR);
  }
  return out;
}

function peakDb(samples: Float32Array, fromRatio = 0.5): number {
  let peak = 0;
  const start = Math.floor(samples.length * fromRatio);
  for (let i = start; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return 20 * Math.log10(peak + 1e-12);
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

describe('R24.3 — feedforward compressor oracle', () => {
  it('settles a hot sine at threshold + overage/ratio', () => {
    const hot = sine(1000, 1, 1.0); // 0 dBFS peak
    const { output, peakGainReductionDb } = applyCompressor(hot, SR, {
      thresholdDb: -12,
      ratio: 4,
      attackMs: 1,
      releaseMs: 50,
      kneeDb: 0,
    });
    // Steady state: -12 + 12/4 = -9 dBFS, ±1.5 dB envelope tolerance.
    // Reduction is 12 dB over minus 3 dB over = 9 dB (not 3).
    const peak = peakDb(output);
    expect(peak).toBeGreaterThan(-10.5);
    expect(peak).toBeLessThan(-7.5);
    expect(peakGainReductionDb).toBeGreaterThan(7.5);
    expect(peakGainReductionDb).toBeLessThan(10.5);
    // Input buffer untouched (non-destructive model). Discrete sampling never
    // lands exactly on the sine peak, so pin a tight band, not exact 0 dBFS.
    const inputPeak = peakDb(hot, 0);
    expect(inputPeak).toBeGreaterThan(-0.01);
    expect(inputPeak).toBeLessThanOrEqual(0);
  });

  it('passes quiet material bit-transparently and honours makeup', () => {
    const quiet = sine(440, 0.5, 0.0316); // ≈ -30 dBFS
    const clean = applyCompressor(quiet, SR, { thresholdDb: -12, ratio: 4, attackMs: 1, releaseMs: 50 });
    expect(clean.peakGainReductionDb).toBeLessThan(0.5);
    expect(maxAbsDiff(clean.output, quiet)).toBeLessThan(1e-9);

    const hot = sine(1000, 1, 1.0);
    const made = applyCompressor(hot, SR, {
      thresholdDb: -12, ratio: 4, attackMs: 1, releaseMs: 50, kneeDb: 0, makeupDb: 6,
    });
    expect(peakDb(made.output)).toBeGreaterThan(-4.5);
    expect(peakDb(made.output)).toBeLessThan(-1.5);
  });

  it('rejects invalid settings and dirty buffers instead of processing', () => {
    expect(() => validateCompressorSettings({ thresholdDb: -12, ratio: 0.5, attackMs: 1, releaseMs: 50 })).toThrow();
    expect(() => validateCompressorSettings({ thresholdDb: -12, ratio: 2, attackMs: 0, releaseMs: 50 })).toThrow();
    expect(() => applyCompressor(new Float32Array(0), SR, { thresholdDb: -12, ratio: 2, attackMs: 1, releaseMs: 50 })).toThrow();
    const dirty = sine(440, 0.1, 0.1);
    dirty[10] = NaN;
    expect(() => applyCompressor(dirty, SR, { thresholdDb: -12, ratio: 2, attackMs: 1, releaseMs: 50 })).toThrow();
  });

  it('maps 1:1 onto DynamicsCompressorNode params for the live graph', () => {
    expect(
      compressorNodeConfig({ thresholdDb: -12, ratio: 4, attackMs: 5, releaseMs: 100, kneeDb: 3 })
    ).toEqual({ threshold: -12, knee: 3, ratio: 4, attack: 0.005, release: 0.1 });
  });
});

describe('R24.3 — HF-driven de-esser oracle', () => {
  it('reduces sibilant-like HF energy and spares vowel-like LF', () => {
    const n = Math.floor(SR * 0.2);
    const hf = new Float32Array(n);
    for (let i = 0; i < n; i++) hf[i] = i % 2 === 0 ? 0.5 : -0.5; // Nyquist alternation
    const lf = sine(100, 0.2, 0.5);
    const settings = { thresholdDb: -20, amount: 1, attackMs: 1, releaseMs: 20 };

    const harsh = applyDeesser(hf, SR, settings);
    expect(harsh.peakReductionDb).toBeGreaterThan(6);
    expect(harsh.output.length).toBe(n);

    const vowel = applyDeesser(lf, SR, settings);
    expect(vowel.peakReductionDb).toBeLessThan(0.1);
    expect(maxAbsDiff(vowel.output, lf)).toBeLessThan(1e-9);
  });

  it('scales depth with amount and validates its inputs', () => {
    const n = Math.floor(SR * 0.2);
    const hf = new Float32Array(n);
    for (let i = 0; i < n; i++) hf[i] = i % 2 === 0 ? 0.5 : -0.5;
    const shallow = applyDeesser(hf, SR, { thresholdDb: -20, amount: 0.25, attackMs: 1, releaseMs: 20 });
    const deep = applyDeesser(hf, SR, { thresholdDb: -20, amount: 1, attackMs: 1, releaseMs: 20 });
    expect(deep.peakReductionDb).toBeGreaterThan(shallow.peakReductionDb);
    expect(() => applyDeesser(hf, SR, { thresholdDb: -20, amount: 2, attackMs: 1, releaseMs: 20 })).toThrow();
  });
});
