import { describe, it, expect } from 'vitest';
import { MultiCamSyncEngine, multicamSyncEngine } from '../multicamSync';
import { rationalToSeconds } from '../../../types/time';

describe('MultiCamSyncEngine', () => {
  it('calculates 0 offset for identical audio signals', () => {
    const sampleRate = 8000;
    const durationSec = 0.5;
    const length = Math.floor(sampleRate * durationSec);
    const signal = new Float32Array(length);

    // Populate with transient burst
    for (let i = 1000; i < 3000; i++) {
      signal[i] = Math.sin((Math.PI * (i - 1000)) / 2000) * Math.sin(2 * Math.PI * 220 * (i / sampleRate));
    }

    const engine = new MultiCamSyncEngine();
    const result = engine.syncAudioWaveforms(signal, signal, sampleRate, 2.0);

    expect(result.offsetSeconds).toBeCloseTo(0, 2);
    expect(rationalToSeconds(result.offsetRational)).toBeCloseTo(0, 2);
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  it('accurately detects temporal offset between shifted signals', () => {
    const sampleRate = 8000;
    const durationSec = 1.0;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const refSignal = new Float32Array(totalSamples);
    const targetSignal = new Float32Array(totalSamples);

    // Audio transient peak at sample 2000 in reference
    for (let i = 1800; i < 2200; i++) {
      const envelope = Math.sin((Math.PI * (i - 1800)) / 400);
      refSignal[i] = envelope * Math.sin(2 * Math.PI * 440 * (i / sampleRate));
    }

    // Shift target signal by +800 samples (+0.100s)
    const shiftSamples = 800;
    for (let i = 0; i < totalSamples - shiftSamples; i++) {
      targetSignal[i + shiftSamples] = refSignal[i];
    }

    const engine = new MultiCamSyncEngine();
    const result = engine.syncAudioWaveforms(refSignal, targetSignal, sampleRate, 2.0);

    // Target started +0.10s later than ref
    expect(result.offsetSeconds).toBeCloseTo(0.1, 1);
    expect(result.confidence).toBeGreaterThan(0.65);
  });

  it('handles empty audio signals gracefully', () => {
    const empty = new Float32Array(0);
    const result = multicamSyncEngine.syncAudioWaveforms(empty, empty);

    expect(result.offsetSeconds).toBe(0);
    expect(result.confidence).toBe(0);
  });
});
