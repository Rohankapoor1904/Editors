import { describe, it, expect } from 'vitest';
import { estimateRt60, matchReverbDecay } from './reverbMatch';

const SR = 44100;

/** Deterministic single-exponential decay burst with the given tau. */
function decayBurst(tauSec: number, seconds: number): Float32Array {
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.exp(-i / SR / tauSec);
  }
  return out;
}

describe('R24.3 remainder — RT60 estimator', () => {
  it('recovers the theoretical RT60 of a synthetic decay', () => {
    // RT60 = tau * ln(1000) ≈ 6.908 * tau.
    const wet = decayBurst(0.1, 1.5);
    const rt60 = estimateRt60(wet, SR);
    expect(rt60).toBeGreaterThan(0.69 * 0.85);
    expect(rt60).toBeLessThan(0.69 * 1.15);
  });

  it('refuses silence, flat lines and non-decaying tails', () => {
    expect(() => estimateRt60(new Float32Array(1000), SR)).toThrow();
    expect(() => estimateRt60(new Float32Array(1000).fill(0.5), SR)).toThrow();
    expect(() => estimateRt60(new Float32Array(10), SR)).toThrow();
    const dirty = decayBurst(0.1, 1.0);
    dirty[500] = NaN;
    expect(() => estimateRt60(dirty, SR)).toThrow();
  });
});

describe('R24.3 remainder — decay matcher (drying only)', () => {
  it('imposes the reference decay on a wetter target', () => {
    const wet = decayBurst(0.2, 2.0); // RT60 ≈ 1.38s
    const targetRt60 = estimateRt60(wet, SR);
    const out = matchReverbDecay(wet, targetRt60, 0.69, SR);
    expect(out.length).toBe(wet.length);
    // Input untouched (f32 storage: compare at f32 precision).
    expect(wet[100]).toBeCloseTo(Math.exp(-100 / SR / 0.2), 6);
    const matched = estimateRt60(out, SR);
    expect(matched).toBeGreaterThan(0.69 * 0.8);
    expect(matched).toBeLessThan(0.69 * 1.2);
  });

  it('refuses to synthesize reflections for a wetter reference', () => {
    const dry = decayBurst(0.05, 1.0);
    expect(() => matchReverbDecay(dry, 0.35, 1.4, SR)).toThrow();
    expect(() => matchReverbDecay(dry, -1, 0.3, SR)).toThrow();
  });
});
