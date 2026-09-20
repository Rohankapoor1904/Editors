import { describe, it, expect, beforeEach } from 'vitest';
import { autoReframeEngine } from '../autoReframe';
import { useTimelineStore } from '../../store/timelineStore';
import { secondsToRational, rationalToSeconds } from '../../types/time';
import { Clip } from '../../types/timeline';

describe('AutoReframe Wiring & Keyframing (R16.2)', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      past: [],
      future: [],
      tracks: [
        {
          id: 'track_v1',
          type: 'video',
          index: 0,
          name: 'Video 1',
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [],
        },
      ],
      metadata: {
        name: 'Test Project',
        fps: 30,
        width: 1920,
        height: 1080,
        sampleRate: 48000,
        colorSpace: 'Rec.709',
      },
    });
  });

  it('generates accurate scale and position keyframes for 16:9 to 9:16 auto-reframe', () => {
    const sourceWidth = 1920;
    const sourceHeight = 1080;
    const durationSeconds = 5.0;
    const targetAspect = 9 / 16;

    const result = autoReframeEngine.generateAutoReframeKeyframes(
      sourceWidth,
      sourceHeight,
      durationSeconds,
      targetAspect
    );

    // Crop width = 1080 * (9/16) = 607.5
    // Scale factor = 1920 / 607.5 ≈ 3.16049
    expect(result.scale.x).toBeCloseTo(3.16, 2);
    expect(result.scale.y).toBeCloseTo(3.16, 2);
    expect(result.initialTransform.scale.x).toBeCloseTo(3.16, 2);
    expect(result.initialTransform.position.y).toBe(0.5);

    // Keyframes should be generated across duration
    expect(result.positionKeyframes.length).toBeGreaterThan(0);
    result.positionKeyframes.forEach((kf) => {
      expect(kf.time).toBeDefined();
      expect(rationalToSeconds(kf.time)).toBeLessThanOrEqual(durationSeconds);
      expect(kf.value).toBeGreaterThan(0);
      expect(kf.easing).toBe('easeInOut');
    });
  });

  it('updates clip transform and position keyframes via autoReframeClipToAspect store action', () => {
    const clipId = 'test_clip_reframe';
    const testClip: Clip = {
      id: clipId,
      assetId: 'asset_1',
      name: 'Landscape Video',
      startOffset: secondsToRational(0),
      sourceIn: secondsToRational(0),
      sourceOut: secondsToRational(10),
      duration: secondsToRational(10),
      transform: {
        position: { x: 0.5, y: 0.5 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
        anchorPoint: { x: 0.5, y: 0.5 },
      },
    };

    useTimelineStore.getState().addClipToTrack('track_v1', testClip);

    // Execute Auto-Reframe
    useTimelineStore.getState().autoReframeClipToAspect(clipId, 9 / 16);

    const updatedClip = useTimelineStore
      .getState()
      .tracks[0].clips.find((c) => c.id === clipId);

    expect(updatedClip).toBeDefined();
    expect(updatedClip?.transform?.scale.x).toBeCloseTo(3.16, 2);
    expect(updatedClip?.keyframes).toBeDefined();
    expect(updatedClip?.keyframes?.['position.x']).toBeDefined();
    expect(updatedClip?.keyframes?.['position.x'].length).toBeGreaterThan(0);

    // Invert via undo
    useTimelineStore.getState().undo();

    const revertedClip = useTimelineStore
      .getState()
      .tracks[0].clips.find((c) => c.id === clipId);

    expect(revertedClip?.transform?.scale.x).toBe(1);
    expect(revertedClip?.keyframes?.['position.x']).toBeUndefined();
  });
});
