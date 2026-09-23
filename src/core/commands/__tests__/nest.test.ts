import { describe, it, expect } from 'vitest';
import { NestClipsCommand, UnnestCompoundCommand } from '../nest';
import { TimelineState, Track, Clip } from '../../../types/timeline';
import { createRational, rationalToSeconds } from '../../../types/time';

function clip(id: string, start: number, dur: number): Clip {
  return {
    id,
    assetId: 'asset-1',
    name: `${id}.mp4`,
    startOffset: createRational(start, 1),
    sourceIn: createRational(0, 1),
    sourceOut: createRational(dur, 1),
    duration: createRational(dur, 1),
  };
}

function createState(clips: Clip[], locked = false): TimelineState {
  const track: Track = {
    id: 'v1', type: 'video', index: 0, name: 'V1',
    muted: false, locked, solo: false, height: 64, clips: [...clips],
  };
  return {
    version: '1.0.0',
    projectId: 'test-project',
    metadata: { name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'Rec.709' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'v1',
    tracks: [track],
    selectedClipIds: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
    markers: [],
    comments: [],
  };
}

describe('R26.1 — NestClipsCommand', () => {
  it('nests 2 clips into a span container with relative children, undoes cleanly', () => {
    const cmd = new NestClipsCommand('v1', ['c1', 'c2'], 'nest-1', 'My Nest');
    const applied = cmd.apply(createState([clip('c1', 2, 4), clip('c2', 6, 4)]));
    const clips = applied.tracks[0].clips;
    expect(clips).toHaveLength(1);
    const nest = clips[0];
    expect(nest.id).toBe('nest-1');
    expect(nest.assetId).toBe('compound://nest-1');
    expect(rationalToSeconds(nest.startOffset)).toBe(2);
    expect(rationalToSeconds(nest.duration)).toBe(8);
    expect(nest.compound?.clips).toHaveLength(2);
    // Children stored span-relative: c1 at +0, c2 at +4.
    expect(rationalToSeconds(nest.compound!.clips[0].startOffset)).toBe(0);
    expect(rationalToSeconds(nest.compound!.clips[1].startOffset)).toBe(4);

    expect(cmd.invert(applied).tracks[0].clips.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('rejects bad nests loudly', () => {
    expect(() => new NestClipsCommand('v1', ['only-one'], 'n')).toThrow();
    const two = createState([clip('c1', 0, 2), clip('c2', 2, 2)]);
    expect(() => new NestClipsCommand('ghost', ['c1', 'c2'], 'n').apply(two)).toThrow();
    expect(() => new NestClipsCommand('v1', ['c1', 'ghost'], 'n').apply(two)).toThrow();
    expect(() => new NestClipsCommand('v1', ['c1', 'c2'], 'n').apply(createState([clip('c1', 0, 2), clip('c2', 2, 2)], true))).toThrow();
    const nested = new NestClipsCommand('v1', ['c1', 'c2'], 'n').apply(two);
    expect(() => new NestClipsCommand('v1', ['n', 'c1'], 'n2').apply(nested)).toThrow();
  });
});

describe('R26.1 — UnnestCompoundCommand', () => {
  it('restores children at absolute positions', () => {
    const nested = new NestClipsCommand('v1', ['c1', 'c2'], 'nest-1').apply(
      createState([clip('c1', 2, 4), clip('c2', 6, 4)])
    );
    const restored = new UnnestCompoundCommand('nest-1').apply(nested);
    const clips = restored.tracks[0].clips;
    expect(clips.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(rationalToSeconds(clips[0].startOffset)).toBe(2);
    expect(rationalToSeconds(clips[1].startOffset)).toBe(6);
  });

  it('rejects non-compounds and missing clips', () => {
    const state = createState([clip('c1', 0, 2)]);
    expect(() => new UnnestCompoundCommand('c1').apply(state)).toThrow();
    expect(() => new UnnestCompoundCommand('ghost').apply(state)).toThrow();
  });
});
