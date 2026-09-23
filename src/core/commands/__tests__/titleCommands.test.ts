import { describe, it, expect } from 'vitest';
import { AddTitleClipCommand, UpdateTitleCommand } from '../titleCommands';
import { TimelineState, Track, Clip } from '../../../types/timeline';
import { createRational } from '../../../types/time';
import { titleTemplate } from '../../../engine/titles';

function videoTrack(locked = false, type: Track['type'] = 'video'): Track {
  return {
    id: 'track-v1',
    type,
    index: 0,
    name: 'V1',
    muted: false,
    locked,
    solo: false,
    height: 64,
    clips: [
      {
        id: 'clip-down',
        assetId: 'asset-9',
        name: 'Downstream.mp4',
        startOffset: createRational(10, 1),
        sourceIn: createRational(0, 1),
        sourceOut: createRational(4, 1),
        duration: createRational(4, 1),
      },
    ],
  };
}

function createState(track: Track): TimelineState {
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

function clipsOf(state: TimelineState): Clip[] {
  return state.tracks[0].clips;
}

describe('R24.4 — AddTitleClipCommand', () => {
  it('appends a title without rippling downstream clips, undoes cleanly', () => {
    const tpl = titleTemplate('tpl-center-title');
    const cmd = new AddTitleClipCommand(
      'track-v1', 'title-1',
      { ...tpl.spec, text: 'Hi', templateId: tpl.id },
      createRational(0, 1),
      createRational(4, 1)
    );
    const applied = cmd.apply(createState(videoTrack()));
    expect(clipsOf(applied)).toHaveLength(2);
    const title = clipsOf(applied).find((c) => c.id === 'title-1')!;
    expect(title.assetId).toBe('title://title-1');
    expect(title.title?.text).toBe('Hi');
    // No ripple: the downstream clip never moved.
    expect(clipsOf(applied).find((c) => c.id === 'clip-down')?.startOffset).toEqual(createRational(10, 1));

    expect(clipsOf(cmd.invert(applied))).toHaveLength(1);
  });

  it('rejects bad tracks, duplicates and invalid specs', () => {
    const tpl = titleTemplate('tpl-center-title');
    const good = { ...tpl.spec, text: 'Hi', templateId: tpl.id };
    expect(() => new AddTitleClipCommand('track-v1', 't', { ...good, text: '' }, createRational(0, 1), createRational(1, 1))).toThrow();
    expect(() => new AddTitleClipCommand('missing', 't', good, createRational(0, 1), createRational(1, 1)).apply(createState(videoTrack()))).toThrow();
    expect(() => new AddTitleClipCommand('track-v1', 't', good, createRational(0, 1), createRational(1, 1)).apply(createState(videoTrack(false, 'audio')))).toThrow();
    expect(() => new AddTitleClipCommand('track-v1', 't', good, createRational(0, 1), createRational(1, 1)).apply(createState(videoTrack(true)))).toThrow();
    const once = new AddTitleClipCommand('track-v1', 't', good, createRational(0, 1), createRational(1, 1)).apply(createState(videoTrack()));
    expect(() => new AddTitleClipCommand('track-v1', 't', good, createRational(0, 1), createRational(1, 1)).apply(once)).toThrow();
  });
});

describe('R24.4 — UpdateTitleCommand', () => {
  function withTitle(): TimelineState {
    const tpl = titleTemplate('tpl-center-title');
    return new AddTitleClipCommand(
      'track-v1', 'title-1',
      { ...tpl.spec, text: 'Hi', templateId: tpl.id },
      createRational(0, 1),
      createRational(4, 1)
    ).apply(createState(videoTrack()));
  }

  it('patches text and undoes to the exact prior spec', () => {
    const update = new UpdateTitleCommand('title-1', { text: 'Hello', color: '#ff0000' });
    const updated = update.apply(withTitle());
    expect(clipsOf(updated).find((c) => c.id === 'title-1')?.title?.text).toBe('Hello');
    expect(clipsOf(updated).find((c) => c.id === 'title-1')?.title?.color).toBe('#ff0000');
    expect(clipsOf(update.invert(updated)).find((c) => c.id === 'title-1')?.title?.text).toBe('Hi');
  });

  it('rejects invalid patches, non-titles and missing clips without mutating', () => {
    const state = withTitle();
    expect(() => new UpdateTitleCommand('title-1', { text: '' }).apply(state)).toThrow();
    expect(() => new UpdateTitleCommand('clip-down', { text: 'x' }).apply(state)).toThrow();
    expect(() => new UpdateTitleCommand('ghost', { text: 'x' }).apply(state)).toThrow();
    expect(clipsOf(state).find((c) => c.id === 'title-1')?.title?.text).toBe('Hi');
  });
});
