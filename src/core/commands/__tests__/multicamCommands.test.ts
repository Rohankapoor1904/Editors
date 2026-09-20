import { describe, it, expect } from 'vitest';
import { SyncClipsCommand, SwitchMultiCamAngleCommand } from '../multicam';
import { TimelineState, Track, Clip } from '../../../types/timeline';
import { secondsToRational, rationalToSeconds } from '../../../types/time';

describe('Multicam Commands', () => {
  const createInitialState = (): TimelineState => {
    const clip1: Clip = {
      id: 'clip_cam1',
      assetId: 'asset_cam1',
      name: 'Cam 1 Angle',
      startOffset: secondsToRational(0),
      duration: secondsToRational(10),
      sourceIn: secondsToRational(0),
      sourceOut: secondsToRational(10),
    };

    const track: Track = {
      id: 'track_v1',
      name: 'Video 1',
      type: 'video',
      index: 0,
      muted: false,
      solo: false,
      locked: false,
      height: 64,
      clips: [clip1],
    };

    return {
      version: '1.0.0',
      projectId: 'proj_test',
      metadata: { name: 'Test Project', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'Rec.709' },
      playheadPosition: secondsToRational(0),
      inPoint: null,
      outPoint: null,
      tracks: [track],
      selectedClipIds: [],
      activeWorkspace: 'edit',
      magneticSnapping: true,
      zoomLevel: 100,
    };
  };

  describe('SyncClipsCommand', () => {
    it('shifts clip startOffset and inverts cleanly', () => {
      const state = createInitialState();
      const newOffset = secondsToRational(1.5);
      const cmd = new SyncClipsCommand('clip_cam1', newOffset);

      const appliedState = cmd.apply(state);
      const clip = appliedState.tracks[0].clips[0];
      expect(rationalToSeconds(clip.startOffset)).toBe(1.5);

      const invertedState = cmd.invert(appliedState);
      const restoredClip = invertedState.tracks[0].clips[0];
      expect(rationalToSeconds(restoredClip.startOffset)).toBe(0);
    });
  });

  describe('SwitchMultiCamAngleCommand', () => {
    it('splits clip at splitTime and switches angle for the second segment', () => {
      const state = createInitialState();
      const splitTime = secondsToRational(4.0);
      const cmd = new SwitchMultiCamAngleCommand(
        'clip_cam1',
        splitTime,
        1,
        'asset_cam2',
        'Guest Close-Up (Cam B)'
      );

      const appliedState = cmd.apply(state);
      const clips = appliedState.tracks[0].clips;
      expect(clips).toHaveLength(2);

      // First segment (Cam 1)
      expect(clips[0].id).toBe('clip_cam1');
      expect(rationalToSeconds(clips[0].duration)).toBe(4.0);
      expect(clips[0].assetId).toBe('asset_cam1');

      // Second segment (Cam 2)
      expect(clips[1].assetId).toBe('asset_cam2');
      expect(clips[1].name).toContain('Guest Close-Up (Cam B)');
      expect(rationalToSeconds(clips[1].startOffset)).toBe(4.0);
      expect(rationalToSeconds(clips[1].duration)).toBe(6.0);

      // Invert restores the single original clip
      const invertedState = cmd.invert(appliedState);
      expect(invertedState.tracks[0].clips).toHaveLength(1);
      expect(invertedState.tracks[0].clips[0].id).toBe('clip_cam1');
      expect(rationalToSeconds(invertedState.tracks[0].clips[0].duration)).toBe(10.0);
    });

    it('switches entire clip angle when splitTime is at start', () => {
      const state = createInitialState();
      const splitTime = secondsToRational(0);
      const cmd = new SwitchMultiCamAngleCommand(
        'clip_cam1',
        splitTime,
        2,
        'asset_cam3',
        'Wide Studio (Cam C)'
      );

      const appliedState = cmd.apply(state);
      const clips = appliedState.tracks[0].clips;
      expect(clips).toHaveLength(1);
      expect(clips[0].assetId).toBe('asset_cam3');
      expect(clips[0].name).toContain('Wide Studio (Cam C)');

      const invertedState = cmd.invert(appliedState);
      expect(invertedState.tracks[0].clips[0].assetId).toBe('asset_cam1');
    });
  });
});
