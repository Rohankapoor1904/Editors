import { describe, it, expect, beforeEach } from 'vitest';
import { beatDetector, BeatDetector } from '../beatDetector';
import { calculateMagneticSnap } from '../../utils/snapping';
import { secondsToRational } from '../../types/time';
import { Clip } from '../../types/timeline';

describe('AI Beat Detector & Rhythm Snapping (R16.3)', () => {
  beforeEach(() => {
    beatDetector.clearCache();
  });

  it('detects transients and estimates accurate BPM from rhythmic audio pulses', () => {
    const sampleRate = 44100;
    const durationSec = 4.0;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const samples = new Float32Array(totalSamples);

    // Generate rhythmic pulses at 120 BPM (0.5s interval: at 0.5s, 1.0s, 1.5s, 2.0s, 2.5s, 3.0s, 3.5s)
    const beatIntervalSec = 0.5;
    for (let t = beatIntervalSec; t < durationSec; t += beatIntervalSec) {
      const startSample = Math.floor(t * sampleRate);
      // High-energy transient burst (simulating drum hit / kick)
      for (let i = 0; i < 500; i++) {
        if (startSample + i < totalSamples) {
          samples[startSample + i] = 0.8 * Math.cos(i * 0.2);
        }
      }
    }

    const detector = new BeatDetector();
    const result = detector.detectBeatsFromSamples(samples, sampleRate);

    expect(result.beats.length).toBeGreaterThanOrEqual(5);
    expect(result.bpm).toBeCloseTo(120, -1); // Close to 120 BPM within ±5

    // Verify first detected pulse is around 0.5s
    expect(result.beats[0]).toBeCloseTo(0.5, 1);
  });

  it('provides deterministic rhythm markers and caches results for assets', () => {
    const assetId = 'asset_soundtrack_01';
    const duration = 15.0;

    const res1 = beatDetector.getOrComputeAssetBeats(assetId, duration);
    expect(res1.bpm).toBeGreaterThanOrEqual(100);
    expect(res1.beats.length).toBeGreaterThan(0);
    expect(res1.beats[res1.beats.length - 1]).toBeLessThanOrEqual(duration);

    // Second call should return cached instance
    const res2 = beatDetector.getOrComputeAssetBeats(assetId, duration);
    expect(res2).toBe(res1);

    // Clear cache
    beatDetector.clearCache();
    const res3 = beatDetector.getOrComputeAssetBeats(assetId, duration);
    expect(res3).toEqual(res1);
  });

  it('magnetically snaps timeline clip drags to nearest musical beat marker', () => {
    const clips: Clip[] = [
      {
        id: 'clip_1',
        assetId: 'asset_1',
        name: 'Video 1',
        startOffset: secondsToRational(0),
        sourceIn: secondsToRational(0),
        sourceOut: secondsToRational(2),
        duration: secondsToRational(2),
      },
    ];

    // Beats at 1.0s, 2.0s, 3.0s, 4.0s
    const beatMarkers = [1.0, 2.0, 3.0, 4.0];
    const zoomLevel = 50; // 50px per second -> 10px threshold = 0.2s

    // Drag at 2.92s -> should snap to 3.0s beat
    const snapResult = calculateMagneticSnap(
      2.92,
      clips,
      0, // playhead at 0
      zoomLevel,
      10, // 10px threshold = 0.2s
      beatMarkers
    );

    expect(snapResult.isSnapped).toBe(true);
    expect(snapResult.snappedTime).toBe(3.0);
    expect(snapResult.snapType).toBe('beat');

    // Drag at 2.6s (outside 0.2s threshold of 2.0s and 3.0s) -> should NOT snap
    const noSnapResult = calculateMagneticSnap(
      2.6,
      clips,
      0,
      zoomLevel,
      10,
      beatMarkers
    );

    expect(noSnapResult.isSnapped).toBe(false);
    expect(noSnapResult.snappedTime).toBe(2.6);
  });
});
