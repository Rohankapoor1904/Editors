import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject, parseAssetDuration } from './serialize';
import { TimelineState } from '../../types/timeline';
import { MediaAsset } from '../../store/mediaPool';
import { createRational } from '../../types/time';

function baseState(): TimelineState {
  return {
    version: '1.4.0',
    projectId: 'proj_dur',
    metadata: {
      name: 'Durations',
      fps: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      colorSpace: 'ACEScg',
    },
    playheadPosition: createRational(0, 24),
    inPoint: null,
    outPoint: null,
    tracks: [],
    selectedClipIds: [],
    markers: [],
    comments: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 100,
  };
}

function asset(id: string, duration: string): MediaAsset {
  return {
    id,
    name: `${id}.mp4`,
    path: `/media/${id}.mp4`,
    type: 'video',
    duration,
    fingerprint: `fp-${id}`,
    isOffline: false,
  };
}

describe('R22.6: honest asset durations', () => {
  it('parses exact value/rate rationals', () => {
    expect(parseAssetDuration('240/24', 24)).toEqual({ value: 240, rate: 24 });
    expect(parseAssetDuration('10/1', 24)).toEqual({ value: 10, rate: 1 });
  });

  it('parses HH:MM:SS at project fps (no dummy 24fps assumption)', () => {
    expect(parseAssetDuration('00:00:10', 24)).toEqual({ value: 240, rate: 24 });
    expect(parseAssetDuration('00:00:10', 30)).toEqual({ value: 300, rate: 30 });
    expect(parseAssetDuration('01:02:03.5', 30)).toEqual({
      value: Math.round(3723.5 * 30),
      rate: 30,
    });
  });

  it('omits (never invents) unparsable durations', () => {
    for (const bad of ['', 'n/a', 'abc', '1/0', '-5/24', '1/2/3', '99:99:99', undefined]) {
      expect(parseAssetDuration(bad, 24)).toBeUndefined();
    }
    expect(parseAssetDuration('00:00:10', 0)).toBeUndefined();
    expect(parseAssetDuration('00:00:10', Number.NaN)).toBeUndefined();
  });

  it('serializes real durations and omits unknown ones from the JSON', () => {
    const json = serializeProject(
      baseState(),
      [asset('a1', '240/24'), asset('a2', '00:00:10'), asset('a3', 'n/a')]
    );
    const pool = JSON.parse(json).media_pool;
    expect(pool[0].duration).toEqual({ value: 240, rate: 24 });
    expect(pool[1].duration).toEqual({ value: 240, rate: 24 });
    expect('duration' in pool[2]).toBe(false);
  });

  it('round-trips unknown durations as explicit unknown instead of throwing', () => {
    const parsed = JSON.parse(serializeProject(baseState(), [asset('a3', 'garbage')]));
    for (const entry of parsed.media_pool) {
      entry.audio_streams = [{ stream_index: 1, codec: 'pcm', channels: 2, sample_rate: 48000 }];
    }
    const { assets } = deserializeProject(JSON.stringify(parsed));
    expect(assets).toHaveLength(1);
    expect(assets[0].duration).toBe('');
  });

  it('round-trips real durations exactly', () => {
    const parsed = JSON.parse(serializeProject(baseState(), [asset('a1', '00:01:30')]));
    for (const entry of parsed.media_pool) {
      entry.audio_streams = [{ stream_index: 1, codec: 'pcm', channels: 2, sample_rate: 48000 }];
    }
    const { assets } = deserializeProject(JSON.stringify(parsed));
    // 90s at 24fps
    expect(assets[0].duration).toBe('2160/24');
  });
});
