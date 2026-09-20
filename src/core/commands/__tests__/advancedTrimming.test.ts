import { describe, it, expect } from 'vitest';
import {
  InsertCommand,
  SlipCommand,
  SlideCommand,
  SplitTrimCommand,
  RealignSyncCommand
} from '../edits';
import { TimelineState, Track, Clip } from '../../../types/timeline';
import { createRational, rationalToSeconds } from '../../../types/time';

function createMockTimelineState(clips: Clip[]): TimelineState {
  const track: Track = {
    id: 'track-v1',
    type: 'video',
    index: 0,
    name: 'V1',
    muted: false,
    locked: false,
    solo: false,
    height: 64,
    clips: [...clips]
  };

  return {
    version: '1.0.0',
    projectId: 'test-project',
    metadata: {
      name: 'Test Project',
      fps: 30,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      colorSpace: 'Rec.709'
    },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'track-v1',
    tracks: [track],
    selectedClipIds: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20
  };
}

describe('Task R15.1 — 3-Point & 4-Point Editing Wiring (InsertCommand)', () => {
  it('inserts clip on empty track and advances playhead', () => {
    const state = createMockTimelineState([]);
    const newClip: Clip = {
      id: 'insert-1',
      assetId: 'asset-1',
      name: 'Take_01.mp4',
      startOffset: createRational(2, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(4, 1),
      duration: createRational(4, 1)
    };

    const cmd = new InsertCommand('track-v1', newClip);
    const updated = cmd.apply(state);

    expect(updated.tracks[0].clips.length).toBe(1);
    expect(updated.tracks[0].clips[0].id).toBe('insert-1');
    expect(rationalToSeconds(updated.playheadPosition)).toBe(6); // 2 + 4 = 6s

    // Undo restores state
    const reverted = cmd.invert(updated);
    expect(reverted.tracks[0].clips.length).toBe(0);
  });

  it('pushes downstream clips forward by inserted clip duration', () => {
    const existingClip: Clip = {
      id: 'existing-1',
      assetId: 'asset-existing',
      name: 'Intro.mp4',
      startOffset: createRational(5, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(10, 1),
      duration: createRational(10, 1)
    };
    const state = createMockTimelineState([existingClip]);

    const insertClip: Clip = {
      id: 'insert-1',
      assetId: 'asset-insert',
      name: 'B_Roll.mp4',
      startOffset: createRational(2, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(6, 1),
      duration: createRational(6, 1)
    };

    const cmd = new InsertCommand('track-v1', insertClip);
    const updated = cmd.apply(state);

    expect(updated.tracks[0].clips.length).toBe(2);
    const pushed = updated.tracks[0].clips.find(c => c.id === 'existing-1')!;
    // Was at 5s, pushed by 6s -> now at 11s
    expect(rationalToSeconds(pushed.startOffset)).toBe(11);
    expect(rationalToSeconds(pushed.duration)).toBe(10);
  });

  it('splits clip in middle and pushes tail downstream', () => {
    const longClip: Clip = {
      id: 'long-1',
      assetId: 'asset-long',
      name: 'Long_Take.mp4',
      startOffset: createRational(0, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(20, 1),
      duration: createRational(20, 1)
    };
    const state = createMockTimelineState([longClip]);

    const insertClip: Clip = {
      id: 'cutaway-1',
      assetId: 'asset-cutaway',
      name: 'Cutaway.mp4',
      startOffset: createRational(8, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(5, 1),
      duration: createRational(5, 1)
    };

    const cmd = new InsertCommand('track-v1', insertClip);
    const updated = cmd.apply(state);

    expect(updated.tracks[0].clips.length).toBe(3);

    // Left part: 0s to 8s (duration 8)
    const left = updated.tracks[0].clips.find(c => c.id === 'long-1')!;
    expect(rationalToSeconds(left.startOffset)).toBe(0);
    expect(rationalToSeconds(left.duration)).toBe(8);
    expect(rationalToSeconds(left.sourceOut)).toBe(8);

    // Inserted clip: 8s to 13s (duration 5)
    const mid = updated.tracks[0].clips.find(c => c.id === 'cutaway-1')!;
    expect(rationalToSeconds(mid.startOffset)).toBe(8);
    expect(rationalToSeconds(mid.duration)).toBe(5);

    // Right part: 13s to 25s (duration 12)
    const right = updated.tracks[0].clips.find(c => c.id !== 'long-1' && c.id !== 'cutaway-1')!;
    expect(rationalToSeconds(right.startOffset)).toBe(13);
    expect(rationalToSeconds(right.duration)).toBe(12);
    expect(rationalToSeconds(right.sourceIn)).toBe(8);
    expect(rationalToSeconds(right.sourceOut)).toBe(20);
  });
});

describe('Task R15.2 — Slip & Slide Trimming Tools', () => {
  it('slips media within clip maintaining timeline position and duration', () => {
    const clip: Clip = {
      id: 'slip-clip',
      assetId: 'asset-1',
      name: 'Interview.mp4',
      startOffset: createRational(10, 1),
      sourceIn: createRational(5, 1),
      sourceOut: createRational(15, 1),
      duration: createRational(10, 1)
    };
    const state = createMockTimelineState([clip]);

    // Slip forward by +2 seconds
    const slipDelta = createRational(2, 1);
    const cmd = new SlipCommand('slip-clip', slipDelta, createRational(30, 1));
    const updated = cmd.apply(state);

    const updatedClip = updated.tracks[0].clips[0];
    // startOffset and duration must be untouched
    expect(rationalToSeconds(updatedClip.startOffset)).toBe(10);
    expect(rationalToSeconds(updatedClip.duration)).toBe(10);
    // source offsets slipped by +2s
    expect(rationalToSeconds(updatedClip.sourceIn)).toBe(7);
    expect(rationalToSeconds(updatedClip.sourceOut)).toBe(17);

    // Invert restores original
    const restored = cmd.invert(updated);
    expect(rationalToSeconds(restored.tracks[0].clips[0].sourceIn)).toBe(5);
  });

  it('clamps slip to sourceIn >= 0 at start boundary', () => {
    const clip: Clip = {
      id: 'slip-boundary',
      assetId: 'asset-1',
      name: 'Interview.mp4',
      startOffset: createRational(10, 1),
      sourceIn: createRational(1, 1),
      sourceOut: createRational(11, 1),
      duration: createRational(10, 1)
    };
    const state = createMockTimelineState([clip]);

    // Slip backwards by -5s, but only 1s of head available
    const slipDelta = createRational(-5, 1);
    const cmd = new SlipCommand('slip-boundary', slipDelta, createRational(30, 1));
    const updated = cmd.apply(state);

    const updatedClip = updated.tracks[0].clips[0];
    expect(rationalToSeconds(updatedClip.sourceIn)).toBe(0);
    expect(rationalToSeconds(updatedClip.sourceOut)).toBe(10);
  });

  it('slides clip between two abutting neighbors with zero gap', () => {
    // Three abutting clips:
    // Clip 1: [0s to 10s]
    // Clip 2: [10s to 20s] (sliding target)
    // Clip 3: [20s to 30s]
    const clip1: Clip = {
      id: 'clip-1',
      assetId: 'asset-1',
      name: 'Clip 1',
      startOffset: createRational(0, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(10, 1),
      duration: createRational(10, 1)
    };
    const clip2: Clip = {
      id: 'clip-2',
      assetId: 'asset-2',
      name: 'Clip 2',
      startOffset: createRational(10, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(10, 1),
      duration: createRational(10, 1)
    };
    const clip3: Clip = {
      id: 'clip-3',
      assetId: 'asset-3',
      name: 'Clip 3',
      startOffset: createRational(20, 1),
      sourceIn: createRational(0, 1),
      sourceOut: createRational(10, 1),
      duration: createRational(10, 1)
    };

    const state = createMockTimelineState([clip1, clip2, clip3]);

    // Slide clip-2 to the right by +3 seconds
    const slideCmd = new SlideCommand('clip-2', createRational(3, 1));
    const updated = slideCmd.apply(state);

    const updatedClip1 = updated.tracks[0].clips.find(c => c.id === 'clip-1')!;
    const updatedClip2 = updated.tracks[0].clips.find(c => c.id === 'clip-2')!;
    const updatedClip3 = updated.tracks[0].clips.find(c => c.id === 'clip-3')!;

    // Clip 1 tail extends to 13s (duration becomes 13s)
    expect(rationalToSeconds(updatedClip1.duration)).toBe(13);
    expect(rationalToSeconds(updatedClip1.sourceOut)).toBe(13);

    // Clip 2 shifts to 13s (duration unchanged at 10s)
    expect(rationalToSeconds(updatedClip2.startOffset)).toBe(13);
    expect(rationalToSeconds(updatedClip2.duration)).toBe(10);
    expect(rationalToSeconds(updatedClip2.sourceIn)).toBe(0);

    // Clip 3 head trims by 3s (starts at 23s, duration becomes 7s)
    expect(rationalToSeconds(updatedClip3.startOffset)).toBe(23);
    expect(rationalToSeconds(updatedClip3.duration)).toBe(7);
    expect(rationalToSeconds(updatedClip3.sourceIn)).toBe(3);

    // Zero gaps: 0 + 13 = 13; 13 + 10 = 23; 23 + 7 = 30
    const totalEnd = rationalToSeconds(updatedClip3.startOffset) + rationalToSeconds(updatedClip3.duration);
    expect(totalEnd).toBe(30);

    // Undo restores all three clips
    const reverted = slideCmd.invert(updated);
    expect(rationalToSeconds(reverted.tracks[0].clips.find(c => c.id === 'clip-1')!.duration)).toBe(10);
    expect(rationalToSeconds(reverted.tracks[0].clips.find(c => c.id === 'clip-2')!.startOffset)).toBe(10);
    expect(rationalToSeconds(reverted.tracks[0].clips.find(c => c.id === 'clip-3')!.startOffset)).toBe(20);
  });
});

describe('Task R15.3 — J-Cuts & L-Cuts Split Audio/Video Trimming', () => {
  it('independently trims audio to create J-Cut and computes sync offset', () => {
    const videoClip: Clip = {
      id: 'vid-1',
      assetId: 'interview-asset',
      name: 'Interview_Video',
      startOffset: createRational(5, 1),
      sourceIn: createRational(5, 1),
      sourceOut: createRational(15, 1),
      duration: createRational(10, 1),
      linkedClipId: 'aud-1'
    };

    const audioClip: Clip = {
      id: 'aud-1',
      assetId: 'interview-asset',
      name: 'Interview_Audio',
      startOffset: createRational(5, 1),
      sourceIn: createRational(5, 1),
      sourceOut: createRational(15, 1),
      duration: createRational(10, 1),
      linkedClipId: 'vid-1'
    };

    const baseState = createMockTimelineState([videoClip]);
    const audioTrack: Track = {
      id: 'track-a1',
      type: 'audio',
      index: 1,
      name: 'A1',
      muted: false,
      locked: false,
      solo: false,
      height: 56,
      clips: [audioClip]
    };
    const state: TimelineState = {
      ...baseState,
      tracks: [baseState.tracks[0], audioTrack]
    };

    // Trim head of audio clip by -2 seconds (audio starts at 3s, before video at 5s -> J-Cut!)
    const splitTrim = new SplitTrimCommand('aud-1', 'in', createRational(-2, 1));
    const updated = splitTrim.apply(state);

    const updatedAudio = updated.tracks[1].clips[0];
    const updatedVideo = updated.tracks[0].clips[0];

    // Audio starts at 3s
    expect(rationalToSeconds(updatedAudio.startOffset)).toBe(3);
    expect(rationalToSeconds(updatedAudio.duration)).toBe(12);
    // Video remains at 5s
    expect(rationalToSeconds(updatedVideo.startOffset)).toBe(5);

    // Both clips should have splitTrimType 'j-cut'
    expect(updatedAudio.splitTrimType).toBe('j-cut');
    expect(updatedVideo.splitTrimType).toBe('j-cut');
    expect(updatedAudio.syncOffset).toBeDefined();
    // Sync offset = audioStart - videoStart = 3 - 5 = -2s
    expect(rationalToSeconds(updatedAudio.syncOffset!)).toBe(-2);
  });

  it('re-aligns sync offset back to zero with RealignSyncCommand', () => {
    const videoClip: Clip = {
      id: 'vid-1',
      assetId: 'interview-asset',
      name: 'Interview_Video',
      startOffset: createRational(5, 1),
      sourceIn: createRational(5, 1),
      sourceOut: createRational(15, 1),
      duration: createRational(10, 1),
      linkedClipId: 'aud-1',
      splitTrimType: 'j-cut',
      syncOffset: createRational(-2, 1)
    };

    const audioClip: Clip = {
      id: 'aud-1',
      assetId: 'interview-asset',
      name: 'Interview_Audio',
      startOffset: createRational(3, 1),
      sourceIn: createRational(3, 1),
      sourceOut: createRational(15, 1),
      duration: createRational(12, 1),
      linkedClipId: 'vid-1',
      splitTrimType: 'j-cut',
      syncOffset: createRational(-2, 1)
    };

    const baseState = createMockTimelineState([videoClip]);
    const audioTrack: Track = {
      id: 'track-a1',
      type: 'audio',
      index: 1,
      name: 'A1',
      muted: false,
      locked: false,
      solo: false,
      height: 56,
      clips: [audioClip]
    };
    const state: TimelineState = {
      ...baseState,
      tracks: [baseState.tracks[0], audioTrack]
    };

    const realignCmd = new RealignSyncCommand('aud-1');
    const updated = realignCmd.apply(state);

    const resAudio = updated.tracks[1].clips[0];
    const resVideo = updated.tracks[0].clips[0];

    // Re-aligned audio matches video
    expect(rationalToSeconds(resAudio.startOffset)).toBe(5);
    expect(rationalToSeconds(resAudio.duration)).toBe(10);
    expect(resAudio.syncOffset).toBeUndefined();
    expect(resAudio.splitTrimType).toBe('none');
    expect(resVideo.syncOffset).toBeUndefined();
  });
});
