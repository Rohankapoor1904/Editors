import { describe, it, expect, beforeEach } from 'vitest';
import { TimelineState, Clip } from '../../../src/types/timeline';
import { secondsToRational, rationalToSeconds } from '../../../src/types/time';
import {
  SplitCommand,
  TrimCommand,
  RippleDeleteCommand,
  OverwriteCommand,
  SlipCommand,
  SlideCommand
} from '../../../src/core/commands/edits';

describe('Edit Commands', () => {
  let initialState: TimelineState;

  beforeEach(() => {
    initialState = {
      version: '1.0.0',
      projectId: 'test_project',
      metadata: {
        name: 'Test',
        fps: 60,
        width: 1920,
        height: 1080,
        sampleRate: 48000,
        colorSpace: 'Rec.709',
      },
      playheadPosition: secondsToRational(0),
      inPoint: null,
      outPoint: null,
      activeWorkspace: 'edit',
      magneticSnapping: true,
      zoomLevel: 20,
      selectedClipIds: [],
      tracks: [
        {
          id: 'track_1',
          type: 'video',
          index: 0,
          name: 'Video 1',
          muted: false,
          locked: false,
          solo: false,
          height: 72,
          clips: [
            {
              id: 'clip_1',
              assetId: 'asset_1',
              name: 'Clip 1',
              startOffset: secondsToRational(0),
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(10),
              duration: secondsToRational(10),
            },
            {
              id: 'clip_2',
              assetId: 'asset_2',
              name: 'Clip 2',
              startOffset: secondsToRational(15), // There is a 5s gap between clip_1 and clip_2
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(5),
              duration: secondsToRational(5),
            }
          ]
        },
        {
          id: 'track_2',
          type: 'audio',
          index: 1,
          name: 'Audio 1',
          muted: false,
          locked: false,
          solo: false,
          height: 72,
          clips: [
            {
              id: 'clip_3',
              assetId: 'asset_3',
              name: 'Clip 3',
              startOffset: secondsToRational(0),
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(20),
              duration: secondsToRational(20),
            }
          ]
        }
      ]
    };
  });

  describe('SplitCommand', () => {
    it('splits a clip at a given rational time', () => {
      // Split at 5 seconds
      const splitTime = secondsToRational(5);
      const command = new SplitCommand('clip_1', splitTime);
      const nextState = command.apply(initialState);

      const track1Clips = nextState.tracks[0].clips;
      expect(track1Clips.length).toBe(3); // clip_1 part 1, clip_1 part 2, clip_2

      const c1 = track1Clips[0];
      const c2 = track1Clips[1];

      expect(c1.id).toBe('clip_1');
      expect(rationalToSeconds(c1.startOffset)).toBe(0);
      expect(rationalToSeconds(c1.duration)).toBe(5);
      expect(rationalToSeconds(c1.sourceOut)).toBe(5);

      expect(c2.id).toContain('split');
      expect(rationalToSeconds(c2.startOffset)).toBe(5);
      expect(rationalToSeconds(c2.duration)).toBe(5);
      expect(rationalToSeconds(c2.sourceIn)).toBe(5);
    });

    it('fails to split outside clip bounds', () => {
      const splitTime = secondsToRational(12); // After clip_1
      const command = new SplitCommand('clip_1', splitTime);
      expect(() => command.apply(initialState)).toThrowError(/outside the bounds/);
    });
  });

  describe('TrimCommand', () => {
    it('trims clip start (in)', () => {
      const delta = secondsToRational(2);
      const command = new TrimCommand('clip_1', 'in', delta);
      const nextState = command.apply(initialState);

      const clip = nextState.tracks[0].clips.find(c => c.id === 'clip_1');
      expect(clip).toBeDefined();
      expect(rationalToSeconds(clip!.startOffset)).toBe(2);
      expect(rationalToSeconds(clip!.duration)).toBe(8);
      expect(rationalToSeconds(clip!.sourceIn)).toBe(2);
    });

    it('rejects trim to zero length', () => {
      // Trim by 10 seconds (entire duration)
      const delta = secondsToRational(10);
      const command = new TrimCommand('clip_1', 'in', delta);
      expect(() => command.apply(initialState)).toThrowError(/zero or negative length/);
    });
  });

  describe('RippleDeleteCommand', () => {
    it('ripples across a gap and preserves downstream clips structure relative to each other', () => {
      // Delete from 5s to 12s (duration 7s).
      // clip_1 (0-10s) -> ends at 10. Overlaps 5-10s. Should be trimmed to 5s.
      // clip_2 (15-20s) -> ends at 20. Completely after the deleted region. Should shift left by 7s (start at 8s).
      // clip_3 (0-20s) -> overlaps 5-12s. Should be split into 0-5s and 12-20s. 12-20s shifts left by 7s (start at 5s).

      const startTime = secondsToRational(5);
      const duration = secondsToRational(7);
      const command = new RippleDeleteCommand(startTime, duration);
      const nextState = command.apply(initialState);

      const track1Clips = nextState.tracks[0].clips;
      expect(track1Clips.length).toBe(2);
      expect(track1Clips[0].id).toBe('clip_1');
      expect(rationalToSeconds(track1Clips[0].duration)).toBe(5);

      expect(track1Clips[1].id).toBe('clip_2');
      expect(rationalToSeconds(track1Clips[1].startOffset)).toBe(15 - 7); // 8s

      const track2Clips = nextState.tracks[1].clips;
      expect(track2Clips.length).toBe(2); // Splitted
      expect(rationalToSeconds(track2Clips[0].duration)).toBe(5);
      expect(rationalToSeconds(track2Clips[1].startOffset)).toBe(5);
      expect(rationalToSeconds(track2Clips[1].duration)).toBe(8);
    });
  });

  describe('OverwriteCommand', () => {
    it('overwrites preserving downstream clips', () => {
      // Insert a 6s clip at 8s on track_1.
      // clip_1 is 0-10s. Overlaps 8-10s. It should be trimmed to 0-8s.
      // clip_2 is 15-20s. Does not overlap (overwrite is 8-14s). Should be preserved.

      const overwriteClip: Clip = {
        id: 'clip_overwrite',
        assetId: 'new_asset',
        name: 'Overwrite Clip',
        startOffset: secondsToRational(8),
        sourceIn: secondsToRational(0),
        sourceOut: secondsToRational(6),
        duration: secondsToRational(6),
      };

      const command = new OverwriteCommand('track_1', overwriteClip);
      const nextState = command.apply(initialState);

      const track1Clips = nextState.tracks[0].clips;
      expect(track1Clips.length).toBe(3); // clip_1 (trimmed), overwriteClip, clip_2

      const c1 = track1Clips.find(c => c.id === 'clip_1');
      expect(rationalToSeconds(c1!.duration)).toBe(8);

      const c2 = track1Clips.find(c => c.id === 'clip_overwrite');
      expect(rationalToSeconds(c2!.startOffset)).toBe(8);
      expect(rationalToSeconds(c2!.duration)).toBe(6);

      const c3 = track1Clips.find(c => c.id === 'clip_2');
      expect(rationalToSeconds(c3!.startOffset)).toBe(15);
      expect(rationalToSeconds(c3!.duration)).toBe(5);
    });
  });

  describe('SlipCommand and SlideCommand', () => {
    it('slips a clip', () => {
      const delta = secondsToRational(2);
      const command = new SlipCommand('clip_1', delta);
      const nextState = command.apply(initialState);

      const clip = nextState.tracks[0].clips.find(c => c.id === 'clip_1');
      expect(rationalToSeconds(clip!.sourceIn)).toBe(2);
      expect(rationalToSeconds(clip!.sourceOut)).toBe(12);
      expect(rationalToSeconds(clip!.startOffset)).toBe(0);
      expect(rationalToSeconds(clip!.duration)).toBe(10);
    });

    it('slides a clip', () => {
      const delta = secondsToRational(2);
      const command = new SlideCommand('clip_1', delta);
      const nextState = command.apply(initialState);

      const clip = nextState.tracks[0].clips.find(c => c.id === 'clip_1');
      expect(rationalToSeconds(clip!.startOffset)).toBe(2);
      expect(rationalToSeconds(clip!.duration)).toBe(10);
      expect(rationalToSeconds(clip!.sourceIn)).toBe(0);
    });
  });
});
