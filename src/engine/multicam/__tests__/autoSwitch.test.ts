import { describe, it, expect } from 'vitest';
import { MultiCamAutoSwitchEngine, MultiCamAngleProfile } from '../autoSwitch';

describe('MultiCamAutoSwitchEngine', () => {
  it('switches between angles corresponding to dominant speaker energy', () => {
    const engine = new MultiCamAutoSwitchEngine();
    const durationSeconds = 8;
    const sampleRate = 4000;
    const totalSamples = durationSeconds * sampleRate;

    // Angle 0: Speaker A talks for first 4 seconds
    const audioA = new Float32Array(totalSamples);
    for (let i = 0; i < 4 * sampleRate; i++) {
      audioA[i] = 0.5 * Math.sin(i * 0.1);
    }

    // Angle 1: Speaker B talks from second 4 to 8
    const audioB = new Float32Array(totalSamples);
    for (let i = 4 * sampleRate; i < 8 * sampleRate; i++) {
      audioB[i] = 0.5 * Math.sin(i * 0.1);
    }

    // Angle 2: Wide shot (Cam C) - silent ambient
    const audioWide = new Float32Array(totalSamples);

    const angles: MultiCamAngleProfile[] = [
      {
        angleIndex: 0,
        name: 'Cam A (Host)',
        assetId: 'asset_cam_a',
        audioSignal: audioA,
      },
      {
        angleIndex: 1,
        name: 'Cam B (Guest)',
        assetId: 'asset_cam_b',
        audioSignal: audioB,
      },
      {
        angleIndex: 2,
        name: 'Cam C (Wide)',
        assetId: 'asset_cam_c',
        audioSignal: audioWide,
      },
    ];

    const cuts = engine.generateAutoCuts(angles, durationSeconds, {
      minShotDurationSec: 2.0,
      speechThresholdDb: -30,
      wideAngleIndex: 2,
      sampleRate,
    });

    expect(cuts.length).toBeGreaterThanOrEqual(2);
    // Initial shot should be angle 0
    expect(cuts[0].angleIndex).toBe(0);
    // Later cut should switch to angle 1
    const secondCut = cuts.find((c) => c.angleIndex === 1);
    expect(secondCut).toBeDefined();
    expect(secondCut!.timestampSeconds).toBeGreaterThanOrEqual(3.5);
  });

  it('switches to wide shot during simultaneous dialogue (cross-talk)', () => {
    const engine = new MultiCamAutoSwitchEngine();
    const durationSeconds = 6;
    const sampleRate = 4000;
    const totalSamples = durationSeconds * sampleRate;

    // Both speakers active simultaneously
    const audioA = new Float32Array(totalSamples);
    const audioB = new Float32Array(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      audioA[i] = 0.6 * Math.sin(i * 0.05);
      audioB[i] = 0.6 * Math.cos(i * 0.05);
    }

    const angles: MultiCamAngleProfile[] = [
      { angleIndex: 0, name: 'Cam A', assetId: 'asset_a', audioSignal: audioA },
      { angleIndex: 1, name: 'Cam B', assetId: 'asset_b', audioSignal: audioB },
      { angleIndex: 2, name: 'Cam Wide', assetId: 'asset_wide', audioSignal: new Float32Array(totalSamples) },
    ];

    const cuts = engine.generateAutoCuts(angles, durationSeconds, {
      minShotDurationSec: 1.5,
      speechThresholdDb: -30,
      wideAngleIndex: 2,
      sampleRate,
    });

    // Should favor the wide camera when simultaneous overlap occurs
    const wideCuts = cuts.filter((c) => c.angleIndex === 2);
    expect(wideCuts.length).toBeGreaterThan(0);
    expect(wideCuts[0].reason).toBe('simultaneous_speech');
  });

  it('enforces minShotDurationSec constraint to prevent rapid jitter', () => {
    const engine = new MultiCamAutoSwitchEngine();
    const durationSeconds = 6;
    const sampleRate = 4000;
    const totalSamples = durationSeconds * sampleRate;

    // Rapid alternating speech every 0.3 seconds
    const audioA = new Float32Array(totalSamples);
    const audioB = new Float32Array(totalSamples);

    for (let sec = 0; sec < durationSeconds; sec += 0.6) {
      const startA = Math.floor(sec * sampleRate);
      const endA = Math.floor((sec + 0.3) * sampleRate);
      for (let i = startA; i < endA; i++) audioA[i] = 0.7;

      const startB = Math.floor((sec + 0.3) * sampleRate);
      const endB = Math.floor((sec + 0.6) * sampleRate);
      for (let i = startB; i < endB; i++) audioB[i] = 0.7;
    }

    const angles: MultiCamAngleProfile[] = [
      { angleIndex: 0, name: 'Cam A', assetId: 'asset_a', audioSignal: audioA },
      { angleIndex: 1, name: 'Cam B', assetId: 'asset_b', audioSignal: audioB },
      { angleIndex: 2, name: 'Cam Wide', assetId: 'asset_wide', audioSignal: new Float32Array(totalSamples) },
    ];

    const cuts = engine.generateAutoCuts(angles, durationSeconds, {
      minShotDurationSec: 2.0, // Minimum 2.0s
      speechThresholdDb: -30,
      wideAngleIndex: 2,
      sampleRate,
    });

    // Check intervals between cuts are >= minShotDurationSec
    for (let i = 1; i < cuts.length; i++) {
      const interval = cuts[i].timestampSeconds - cuts[i - 1].timestampSeconds;
      expect(interval).toBeGreaterThanOrEqual(1.95);
    }
  });
});
