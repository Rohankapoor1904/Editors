import { describe, it, expect } from 'vitest';
import {
  measureLUFS,
  measureIntegratedLUFS,
  measureTruePeak,
  NotImplementedError,
} from './loudness';
import { NotImplementedError as SharedNotImplementedError, setRuntimeMode } from '../services/runtimeConfig';

function referenceTone(): Float32Array {
  const sr = 48000;
  const tone = new Float32Array(sr * 3);
  const peakAmp = Math.pow(10, -19.99 / 20);
  const w = (2 * Math.PI * 1000) / sr;
  const phaseShift = Math.PI / 2;
  for (let i = 0; i < tone.length; i++) {
    tone[i] = peakAmp * Math.cos(w * i - phaseShift);
  }
  return tone;
}

describe('R22.5: LUFS split API + shared error class', () => {
  it('shares one NotImplementedError identity with runtimeConfig', () => {
    expect(NotImplementedError).toBe(SharedNotImplementedError);
  });

  it('measures integrated loudness live without true-peak (reference -23 LUFS tone)', () => {
    setRuntimeMode('live');
    const integrated = measureIntegratedLUFS([referenceTone()], 48000);
    // -19.99 dBFS peak sine => -23.0 dB RMS; K-weighting is ~0dB at 1kHz.
    expect(integrated).toBeCloseTo(-23, 0);
  });

  it('is deterministic and answers silence honestly', () => {
    setRuntimeMode('live');
    const tone = referenceTone();
    expect(measureIntegratedLUFS([tone], 48000)).toBe(measureIntegratedLUFS([tone], 48000));
    expect(measureIntegratedLUFS([new Float32Array(48000)], 48000)).toBe(-Infinity);
    expect(measureIntegratedLUFS([], 48000)).toBe(-Infinity);
  });

  it('rejects unsupported sample rates in live mode', () => {
    setRuntimeMode('live');
    expect(() => measureIntegratedLUFS([new Float32Array(44100)], 44100)).toThrow(NotImplementedError);
    expect(() => measureLUFS([new Float32Array(44100)], 44100)).toThrow(NotImplementedError);
  });

  it('measureLUFS throws live because true-peak is unimplemented (no half measurement)', () => {
    setRuntimeMode('live');
    expect(() => measureTruePeak([referenceTone()])).toThrow(NotImplementedError);
    expect(() => measureLUFS([referenceTone()], 48000)).toThrow(NotImplementedError);
  });

  it('demo mode returns the sample-peak stand-in for true peak', () => {
    setRuntimeMode('demo');
    try {
      const peak = measureTruePeak([referenceTone()]);
      expect(peak).toBeCloseTo(-20, 0);
      const full = measureLUFS([referenceTone()], 48000);
      expect(full.integrated).toBeCloseTo(-23, 0);
    } finally {
      setRuntimeMode('live');
    }
  });
});
