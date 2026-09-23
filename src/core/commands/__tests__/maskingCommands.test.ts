import { describe, it, expect } from 'vitest';
import { AddMaskCommand, UpdateMaskCommand, RemoveMaskCommand } from '../masking';
import { TimelineState, Track, Clip, ClipMask } from '../../../types/timeline';
import { createRational } from '../../../types/time';

function testMask(overrides: Partial<ClipMask> = {}): ClipMask {
  return {
    id: 'mask-1',
    shape: 'rect',
    subjectClass: 'person',
    centerX: 0.5,
    centerY: 0.5,
    sizeX: 0.4,
    sizeY: 0.4,
    ...overrides,
  };
}

function testClip(): Clip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    name: 'Take_01.mp4',
    startOffset: createRational(0, 1),
    sourceIn: createRational(0, 1),
    sourceOut: createRational(4, 1),
    duration: createRational(4, 1),
  };
}

function createState(locked = false): TimelineState {
  const track: Track = {
    id: 'track-v1',
    type: 'video',
    index: 0,
    name: 'V1',
    muted: false,
    locked,
    solo: false,
    height: 64,
    clips: [testClip()],
  };
  return {
    version: '1.0.0',
    projectId: 'test-project',
    metadata: { name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'Rec.709' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'track-v1',
    tracks: [track],
    selectedClipIds: [],
    markers: [],
    comments: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

function masksOf(state: TimelineState): ClipMask[] | undefined {
  return state.tracks[0].clips[0].masks;
}

describe('R24.1 — AddMaskCommand', () => {
  it('attaches the mask, undoes cleanly, and re-applies (redo)', () => {
    const cmd = new AddMaskCommand('clip-1', testMask());
    const applied = cmd.apply(createState());
    expect(masksOf(applied)).toHaveLength(1);
    expect(masksOf(applied)?.[0].id).toBe('mask-1');

    const undone = cmd.invert(applied);
    expect(masksOf(undone)).toBeUndefined();

    const redone = cmd.apply(undone);
    expect(masksOf(redone)).toHaveLength(1);
  });

  it('rejects duplicates, missing clips, locked tracks and invalid masks', () => {
    const cmd = new AddMaskCommand('clip-1', testMask());
    const applied = cmd.apply(createState());
    expect(() => cmd.apply(applied)).toThrow();

    expect(() => new AddMaskCommand('clip-1', testMask({ centerX: 5 }))).toThrow();
    expect(() => new AddMaskCommand('nope', testMask()).apply(createState())).toThrow();
    expect(() => new AddMaskCommand('clip-1', testMask()).apply(createState(true))).toThrow();
  });
});

describe('R24.1 — UpdateMaskCommand', () => {
  it('patches mask fields and undoes to the exact prior mask', () => {
    const add = new AddMaskCommand('clip-1', testMask());
    const withMask = add.apply(createState());

    const update = new UpdateMaskCommand('clip-1', 'mask-1', { centerX: 0.7, feather: 0.25 });
    const updated = update.apply(withMask);
    expect(masksOf(updated)?.[0].centerX).toBe(0.7);
    expect(masksOf(updated)?.[0].feather).toBe(0.25);
    expect(masksOf(updated)?.[0].sizeX).toBe(0.4);

    const undone = update.invert(updated);
    expect(masksOf(undone)?.[0].centerX).toBe(0.5);
    expect(masksOf(undone)?.[0].feather).toBeUndefined();
  });

  it('rejects unknown masks, invalid patches and locked tracks without mutating', () => {
    const withMask = new AddMaskCommand('clip-1', testMask()).apply(createState());
    expect(() => new UpdateMaskCommand('clip-1', 'ghost', { centerX: 0.1 }).apply(withMask)).toThrow();
    expect(() => new UpdateMaskCommand('clip-1', 'mask-1', { centerX: 9 }).apply(withMask)).toThrow();
    expect(() => new UpdateMaskCommand('clip-1', 'mask-1', { centerX: 0.1 }).apply(createState(true))).toThrow();
    // Failed updates left the mask untouched.
    expect(masksOf(withMask)?.[0].centerX).toBe(0.5);
  });
});

describe('R24.1 — RemoveMaskCommand', () => {
  it('removes the mask and restores it on undo', () => {
    const withMask = new AddMaskCommand('clip-1', testMask()).apply(createState());
    const remove = new RemoveMaskCommand('clip-1', 'mask-1');
    const removed = remove.apply(withMask);
    expect(masksOf(removed)).toHaveLength(0);

    const undone = remove.invert(removed);
    expect(masksOf(undone)).toHaveLength(1);
  });

  it('throws on unknown mask ids instead of silently succeeding', () => {
    const withMask = new AddMaskCommand('clip-1', testMask()).apply(createState());
    expect(() => new RemoveMaskCommand('clip-1', 'ghost').apply(withMask)).toThrow();
  });
});
