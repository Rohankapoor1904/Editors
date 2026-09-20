import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateDurationForSpeed,
  calculateTimelineDurationForEnvelope,
  mapTimelineToSourceTime,
  getInstantaneousPlaybackRate,
  createSpeedRampTemplate,
  speedToFraction
} from '../speedRamp';
import { createRational, secondsToRational, rationalToSeconds } from '../../types/time';
import { Clip } from '../../types/timeline';
import { useTimelineStore } from '../../store/timelineStore';

describe('Velocity Envelopes & Visual Speed Ramping Engine (Task R14.2)', () => {
  const source10s = createRational(600, 60); // 10.0 seconds at 60fps

  describe('Rational Arithmetic & Duration Calculation (Zero-Drift)', () => {
    it('converts decimal speeds to exact rational fractions', () => {
      expect(speedToFraction(1.0)).toEqual([1, 1]);
      expect(speedToFraction(0.5)).toEqual([1, 2]);
      expect(speedToFraction(2.0)).toEqual([2, 1]);
      expect(speedToFraction(0.25)).toEqual([1, 4]);
      expect(speedToFraction(4.0)).toEqual([4, 1]);
    });

    it('halves clip duration at 2.0x fast-forward without float drift', () => {
      const result = calculateDurationForSpeed(source10s, 2.0);
      expect(rationalToSeconds(result)).toBeCloseTo(5.0);
      expect(result.value / result.rate).toBe(5);
    });

    it('doubles clip duration at 0.5x slow-motion without float drift', () => {
      const result = calculateDurationForSpeed(source10s, 0.5);
      expect(rationalToSeconds(result)).toBeCloseTo(20.0);
      expect(result.value / result.rate).toBe(20);
    });

    it('handles minimum 0.25x (40s) and maximum 4.0x (2.5s) speed boundaries', () => {
      const slow = calculateDurationForSpeed(source10s, 0.25);
      expect(rationalToSeconds(slow)).toBeCloseTo(40.0);

      const fast = calculateDurationForSpeed(source10s, 4.0);
      expect(rationalToSeconds(fast)).toBeCloseTo(2.5);
    });

    it('calculates duration for multi-point velocity envelopes', () => {
      const rampTemplate = createSpeedRampTemplate('slow-mo', source10s);
      const rampDuration = calculateTimelineDurationForEnvelope(source10s, rampTemplate);

      // In slow-mo template, clip spends time at 0.25x speed, so timeline duration must be longer than 10s
      const durSec = rationalToSeconds(rampDuration);
      expect(durSec).toBeGreaterThan(10.0);
      expect(rampDuration.rate).toBe(60);
    });
  });

  describe('Timestamp Mapping (Timeline to Source)', () => {
    it('maps 1:1 at normal 1.0x speed', () => {
      const timelineOffset = secondsToRational(3.0, 60);
      const sourceIn = secondsToRational(0.0, 60);
      const mapped = mapTimelineToSourceTime(timelineOffset, sourceIn, source10s, { constantSpeed: 1.0 });

      expect(rationalToSeconds(mapped)).toBeCloseTo(3.0);
    });

    it('maps timeline offset to twice the source offset at 2.0x speed', () => {
      const timelineOffset = secondsToRational(2.0, 60);
      const sourceIn = secondsToRational(0.0, 60);
      const mapped = mapTimelineToSourceTime(timelineOffset, sourceIn, source10s, { constantSpeed: 2.0 });

      expect(rationalToSeconds(mapped)).toBeCloseTo(4.0);
    });

    it('maps in reverse direction when reverse is enabled', () => {
      const timelineOffset = secondsToRational(0.0, 60); // start of timeline
      const sourceIn = secondsToRational(0.0, 60);
      const mappedStart = mapTimelineToSourceTime(timelineOffset, sourceIn, source10s, {
        constantSpeed: 1.0,
        reverse: true,
      });

      // At timeline t=0 in reverse, we should be at source end (10.0s)
      expect(rationalToSeconds(mappedStart)).toBeCloseTo(10.0);

      // At timeline t=10 in reverse, we should be at source start (0.0s)
      const mappedEnd = mapTimelineToSourceTime(secondsToRational(10.0, 60), sourceIn, source10s, {
        constantSpeed: 1.0,
        reverse: true,
      });
      expect(rationalToSeconds(mappedEnd)).toBeCloseTo(0.0);
    });

    it('evaluates instantaneous playback rates correctly', () => {
      expect(getInstantaneousPlaybackRate(secondsToRational(1, 60), { constantSpeed: 1.5 })).toBe(1.5);
      expect(getInstantaneousPlaybackRate(secondsToRational(1, 60), { constantSpeed: 10.0 })).toBe(4.0); // Clamped to MAX_SPEED
      expect(getInstantaneousPlaybackRate(secondsToRational(1, 60), { constantSpeed: 0.05 })).toBe(0.25); // Clamped to MIN_SPEED
    });
  });

  describe('ApplySpeedRampCommand (Command Pattern & Undo/Redo)', () => {
    const testClip: Clip = {
      id: 'clip_speed_test',
      assetId: 'asset_1',
      name: 'Skateboard Trick',
      startOffset: secondsToRational(0, 60),
      sourceIn: secondsToRational(0, 60),
      sourceOut: secondsToRational(10, 60),
      duration: secondsToRational(10, 60),
    };

    beforeEach(() => {
      useTimelineStore.setState({
        past: [],
        future: [],
        tracks: [
          {
            id: 'track_1',
            type: 'video',
            index: 0,
            name: 'V1',
            muted: false,
            locked: false,
            solo: false,
            height: 64,
            clips: [JSON.parse(JSON.stringify(testClip))],
          },
        ],
      });
    });

    it('applies 2.0x speed, recalculating clip duration to 5s, and undoes back to 10s', () => {
      const store = useTimelineStore.getState();

      // Apply 2.0x speed
      store.applySpeedRamp('clip_speed_test', { constantSpeed: 2.0 });

      const clipAfter = useTimelineStore.getState().tracks[0].clips[0];
      expect(clipAfter.speed).toBe(2.0);
      expect(rationalToSeconds(clipAfter.duration)).toBeCloseTo(5.0);

      // Undo
      useTimelineStore.getState().undo();
      const clipUndone = useTimelineStore.getState().tracks[0].clips[0];
      expect(clipUndone.speed).toBeUndefined();
      expect(rationalToSeconds(clipUndone.duration)).toBeCloseTo(10.0);

      // Redo
      useTimelineStore.getState().redo();
      const clipRedone = useTimelineStore.getState().tracks[0].clips[0];
      expect(clipRedone.speed).toBe(2.0);
      expect(rationalToSeconds(clipRedone.duration)).toBeCloseTo(5.0);
    });

    it('applies velocity ramp curve envelope and undoes cleanly', () => {
      const store = useTimelineStore.getState();
      const ramp = createSpeedRampTemplate('slow-mo', testClip.duration);

      store.applySpeedRamp('clip_speed_test', { envelope: ramp });

      const clipAfter = useTimelineStore.getState().tracks[0].clips[0];
      expect(clipAfter.speedRamp?.envelope).toBeDefined();
      expect(clipAfter.speedRamp?.envelope?.length).toBe(4);
      expect(rationalToSeconds(clipAfter.duration)).toBeGreaterThan(10.0);

      // Undo
      useTimelineStore.getState().undo();
      const clipUndone = useTimelineStore.getState().tracks[0].clips[0];
      expect(clipUndone.speedRamp).toBeUndefined();
      expect(rationalToSeconds(clipUndone.duration)).toBeCloseTo(10.0);
    });

    it('applies reverse playback flag and undoes cleanly', () => {
      const store = useTimelineStore.getState();

      store.applySpeedRamp('clip_speed_test', { reverse: true, constantSpeed: 1.0 });

      const clipAfter = useTimelineStore.getState().tracks[0].clips[0];
      expect(clipAfter.reverse).toBe(true);

      // Undo
      useTimelineStore.getState().undo();
      expect(useTimelineStore.getState().tracks[0].clips[0].reverse).toBeFalsy();
    });
  });
});
