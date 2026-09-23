import { describe, it, expect } from 'vitest';
import {
  parseScriptToScenes,
  countWords,
  estimateVoSeconds,
  planScriptToVideo,
  DEFAULT_WPM,
  MIN_SCENE_SEC,
} from './scriptToVideo';
import { TimelineState, Track } from '../types/timeline';
import { createRational, rationalToSeconds } from '../types/time';

const SCRIPT = `Cold Open
Welcome to the show. Today we sail at dawn.

Interview
My name is Ada and I keep the lighthouse.

Outro
Thanks for watching. Goodnight.`;

function emptyState(): TimelineState {
  const video: Track = {
    id: 'v1', type: 'video', index: 0, name: 'V1',
    muted: false, locked: false, solo: false, height: 64, clips: [],
  };
  const audio: Track = {
    id: 'a1', type: 'audio', index: 1, name: 'A1',
    muted: false, locked: false, solo: false, height: 56, clips: [],
  };
  return {
    version: '1.0.0',
    projectId: 'test-project',
    metadata: { name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'Rec.709' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'v1',
    tracks: [video, audio],
    selectedClipIds: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
    markers: [],
    comments: [],
  };
}

describe('R25.2 — script parsing', () => {
  it('splits a 3-scene script on blank lines with headings', () => {
    const scenes = parseScriptToScenes(SCRIPT);
    expect(scenes).toHaveLength(3);
    expect(scenes[0].heading).toBe('Cold Open');
    expect(scenes[1].body).toMatch(/lighthouse/);
    expect(scenes[2].heading).toBe('Outro');
  });

  it('rejects empty scripts instead of drafting one scene', () => {
    expect(() => parseScriptToScenes('')).toThrow();
    expect(() => parseScriptToScenes('   \n\n  ')).toThrow();
  });
});

describe('R25.2 — scratch VO estimation', () => {
  it('applies the WPM rate with a documented floor', () => {
    expect(countWords('  hello   world ')).toBe(2);
    // 150 words at 150wpm = 60s.
    expect(estimateVoSeconds(new Array(151).join('word '), DEFAULT_WPM)).toBeCloseTo(60, 6);
    // Micro-scenes floor at MIN_SCENE_SEC rather than vanishing.
    expect(estimateVoSeconds('Hi.', DEFAULT_WPM)).toBe(MIN_SCENE_SEC);
    expect(() => estimateVoSeconds('Hello', 0)).toThrow();
  });
});

describe('R25.2 — draft planning (acceptance: VO-matched scene clips)', () => {
  it('plans 3 ordered title clips with estimated durations in one undo', () => {
    const scenes = parseScriptToScenes(SCRIPT);
    const result = planScriptToVideo(scenes, { trackId: 'v1', startAtSec: 0, rate: 30 });
    expect(result.sceneCount).toBe(3);
    expect(result.commands).toHaveLength(3);
    expect(result.bedPlaced).toBe(false);

    const applied = result.transaction.apply(emptyState());
    const clips = applied.tracks[0].clips;
    expect(clips).toHaveLength(3);
    // Scene 1: 11 words -> 11/150*60 = 4.4s.
    expect(rationalToSeconds(clips[0].duration)).toBeCloseTo(4.4, 6);
    expect(clips[0].title?.text).toMatch(/Cold Open/);
    // Sequential: each starts where the previous ends.
    expect(clips[1].startOffset.value).toBe(clips[0].startOffset.value + clips[0].duration.value);
    expect(clips[2].startOffset.value).toBe(
      clips[1].startOffset.value + clips[1].duration.value
    );

    expect(result.transaction.invert(applied).tracks[0].clips).toHaveLength(0);
  });

  it('lays a real music bed across the draft when given an asset', () => {
    const scenes = parseScriptToScenes(SCRIPT);
    const result = planScriptToVideo(scenes, {
      trackId: 'v1',
      audioTrackId: 'a1',
      musicAssetId: 'bed-asset',
      startAtSec: 0,
      rate: 30,
    });
    expect(result.commands).toHaveLength(4);
    expect(result.bedPlaced).toBe(true);

    const applied = result.transaction.apply(emptyState());
    const bed = applied.tracks[1].clips[0];
    expect(bed.assetId).toBe('bed-asset');
    expect(rationalToSeconds(bed.duration)).toBeCloseTo(result.totalSec, 6);
  });

  it('refuses degenerate plans loudly', () => {
    expect(() => planScriptToVideo([], { trackId: 'v1', startAtSec: 0, rate: 30 })).toThrow();
    expect(() =>
      planScriptToVideo(parseScriptToScenes(SCRIPT), { trackId: '', startAtSec: 0, rate: 30 })
    ).toThrow();
    expect(() =>
      planScriptToVideo(parseScriptToScenes(SCRIPT), {
        trackId: 'v1', startAtSec: 0, rate: 30, musicAssetId: 'bed-only',
      })
    ).toThrow();
  });
});
