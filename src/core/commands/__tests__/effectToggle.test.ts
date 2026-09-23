import { describe, it, expect } from 'vitest';
import { ToggleClipEffectCommand } from '../edits';
import { TimelineState, Track, Clip } from '../../../types/timeline';
import { createRational } from '../../../types/time';

function clipWithEffect(): Clip {
  return {
    id: 'clip-1',
    assetId: 'asset-1',
    name: 'Take.mp4',
    startOffset: createRational(0, 1),
    sourceIn: createRational(0, 1),
    sourceOut: createRational(4, 1),
    duration: createRational(4, 1),
    effects: [{ id: 'fx-bg', type: 'bg_remove', enabled: true, params: { strategy: 'chroma' } }],
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
    clips: [clipWithEffect()],
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
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
    markers: [],
    comments: [],
  };
}

function enabledOf(state: TimelineState): boolean | undefined {
  return state.tracks[0].clips[0].effects?.find((e) => e.id === 'fx-bg')?.enabled;
}

describe('R25.5 — ToggleClipEffectCommand', () => {
  it('flips enabled and undoes to the pre-apply snapshot', () => {
    const cmd = new ToggleClipEffectCommand('clip-1', 'fx-bg');
    const off = cmd.apply(createState());
    expect(enabledOf(off)).toBe(false);
    // Invert restores the snapshot taken at apply time (s0: enabled).
    expect(enabledOf(cmd.invert(off))).toBe(true);
    const on = cmd.apply(off);
    expect(enabledOf(on)).toBe(true);
    // ...and symmetrically back to the off snapshot.
    expect(enabledOf(cmd.invert(on))).toBe(false);
  });

  it('throws on unknown clips, effects and locked tracks', () => {
    expect(() => new ToggleClipEffectCommand('ghost', 'fx-bg').apply(createState())).toThrow();
    expect(() => new ToggleClipEffectCommand('clip-1', 'ghost').apply(createState())).toThrow();
    expect(() => new ToggleClipEffectCommand('clip-1', 'fx-bg').apply(createState(true))).toThrow();
  });
});
