import { describe, it, expect } from 'vitest';
import { SetClipAudioRoleCommand, UpsertClipAudioEffectCommand } from '../audio';
import { TimelineState, Track, Clip } from '../../../types/timeline';
import { createRational } from '../../../types/time';

function testClip(): Clip {
  return {
    id: 'clip-a1',
    assetId: 'asset-1',
    name: 'Dialogue.wav',
    startOffset: createRational(0, 1),
    sourceIn: createRational(0, 1),
    sourceOut: createRational(4, 1),
    duration: createRational(4, 1),
  };
}

function createState(locked = false): TimelineState {
  const track: Track = {
    id: 'track-a1',
    type: 'audio',
    index: 2,
    name: 'A1',
    muted: false,
    locked,
    solo: false,
    height: 56,
    clips: [testClip()],
  };
  return {
    version: '1.0.0',
    projectId: 'test-project',
    metadata: { name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'Rec.709' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'track-a1',
    tracks: [track],
    selectedClipIds: [],
    markers: [],
    comments: [],
    activeWorkspace: 'audio',
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

function clipOf(state: TimelineState): Clip {
  return state.tracks[0].clips[0];
}

describe('R24.3 — SetClipAudioRoleCommand', () => {
  it('tags, undoes and re-applies the role', () => {
    const cmd = new SetClipAudioRoleCommand('clip-a1', 'dialogue');
    const applied = cmd.apply(createState());
    expect(clipOf(applied).audioRole).toBe('dialogue');

    const undone = cmd.invert(applied);
    expect(clipOf(undone).audioRole).toBeUndefined();

    expect(clipOf(cmd.apply(undone)).audioRole).toBe('dialogue');
  });

  it('rejects unknown roles, missing clips and locked tracks', () => {
    expect(() => new SetClipAudioRoleCommand('clip-a1', 'voiceover' as never)).toThrow();
    expect(() => new SetClipAudioRoleCommand('ghost', 'music').apply(createState())).toThrow();
    expect(() => new SetClipAudioRoleCommand('clip-a1', 'music').apply(createState(true))).toThrow();
  });
});

describe('R24.3 — UpsertClipAudioEffectCommand', () => {
  it('creates then patches a dynamics entry, undo restores the chain', () => {
    const upsert = new UpsertClipAudioEffectCommand('clip-a1', 'dyn_comp', 'dynamics_compressor', {
      thresholdDb: -12,
      ratio: 4,
    });
    const created = upsert.apply(createState());
    expect(clipOf(created).audioEffects).toHaveLength(1);

    const patched = new UpsertClipAudioEffectCommand('clip-a1', 'dyn_comp', 'dynamics_compressor', {
      thresholdDb: -18,
      ratio: 3,
    }).apply(created);
    const entry = clipOf(patched).audioEffects?.find((e) => e.id === 'dyn_comp');
    expect(entry?.params).toEqual({ thresholdDb: -18, ratio: 3 });
    expect(clipOf(patched).audioEffects).toHaveLength(1);

    expect(clipOf(upsert.invert(created)).audioEffects ?? []).toHaveLength(0);
  });

  it('throws on missing clips and locked tracks without mutating', () => {
    const state = createState();
    expect(
      () => new UpsertClipAudioEffectCommand('ghost', 'x', 'dynamics_compressor', {}).apply(state)
    ).toThrow();
    expect(
      () => new UpsertClipAudioEffectCommand('clip-a1', 'x', 'dynamics_compressor', {}).apply(createState(true))
    ).toThrow();
    expect(clipOf(state).audioEffects ?? []).toHaveLength(0);
  });
});
