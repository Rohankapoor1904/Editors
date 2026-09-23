import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject } from './serialize';
import { TimelineState } from '../../types/timeline';
import { MediaAsset } from '../../store/mediaPool';
import { createRational } from '../../types/time';
import { NestClipsCommand } from '../commands/nest';

function clip(id: string, start: number, dur: number) {
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

function baseState(): TimelineState {
  return {
    version: '1.0.0',
    projectId: 'proj_nest',
    metadata: { name: 'T', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'sRGB' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'v1',
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64,
        clips: [
          clip('c1', 2, 4),
          clip('c2', 6, 4),
          {
            id: 'adj1',
            assetId: 'adjustment://adj1',
            name: 'Adjustment Layer',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(10, 1),
            duration: createRational(10, 1),
            adjustment: true,
          },
        ],
      },
    ],
    selectedClipIds: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
    markers: [],
    comments: [],
  };
}

const ASSETS: MediaAsset[] = [
  {
    id: 'asset-1', name: 'A.mp4', path: '/m/a.mp4', type: 'video',
    duration: '240/24', fingerprint: 'fp1', isOffline: false,
  },
];

function withAudioStreams(doc: unknown): string {
  const parsed = JSON.parse(JSON.stringify(doc)) as {
    media_pool: { audio_streams?: unknown[] }[];
  };
  for (const entry of parsed.media_pool) {
    entry.audio_streams = [{ stream_index: 1, codec: 'pcm', channels: 2, sample_rate: 48000 }];
  }
  return JSON.stringify(parsed);
}

describe('R26.1 — compound + adjustment JSON round-trip', () => {
  it('persists nested children and the adjustment flag', () => {
    const nested = new NestClipsCommand('v1', ['c1', 'c2'], 'nest-1', 'Reel').apply(baseState());
    const doc = JSON.parse(serializeProject(nested, ASSETS));
    const items = doc.sequences[0].video_tracks[0].items;
    expect(items).toHaveLength(2);
    const compound = items.find((i: { clip_id: string }) => i.clip_id === 'nest-1');
    expect(compound.compound.name).toBe('Reel');
    expect(compound.compound.clips.map((c: { clip_id: string }) => c.clip_id)).toEqual(['c1', 'c2']);
    expect(items.find((i: { clip_id: string }) => i.clip_id === 'adj1').adjustment).toBe(true);

    const { timelineState } = deserializeProject(withAudioStreams(doc));
    const clips = timelineState.tracks?.[0].clips ?? [];
    expect(clips).toHaveLength(2);
    const restored = clips.find((c) => c.id === 'nest-1')!;
    expect(restored.compound?.clips.map((c) => c.id)).toEqual(['c1', 'c2']);
    // Relative offsets survived the trip.
    expect(restored.compound?.clips[1].startOffset).toEqual(createRational(4, 1));
    expect(clips.find((c) => c.id === 'adj1')?.adjustment).toBe(true);
  });

  it('rejects a compound with no children', () => {
    const doc = JSON.parse(serializeProject(baseState(), ASSETS));
    const bad = JSON.parse(JSON.stringify(doc));
    bad.sequences[0].video_tracks[0].items.push({
      type: 'Clip',
      clip_id: 'empty-nest',
      asset_reference_id: 'compound://empty-nest',
      source_range: { start_time: { value: 0, rate: 1 }, duration: { value: 1, rate: 1 } },
      timeline_range: { start_time: { value: 0, rate: 1 }, duration: { value: 1, rate: 1 } },
      compound: { name: 'Empty', clips: [] },
    });
    expect(() => deserializeProject(withAudioStreams(bad))).toThrow();
  });
});
