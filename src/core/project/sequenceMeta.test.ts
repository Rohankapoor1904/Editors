import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject } from './serialize';
import { TimelineState } from '../../types/timeline';
import { MediaAsset } from '../../store/mediaPool';
import { createRational } from '../../types/time';

function stateWithMarker(): TimelineState {
  return {
    version: '1.0.0',
    projectId: 'proj_meta',
    metadata: { name: 'T', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'sRGB' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'v1',
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64, clips: [],
      },
    ],
    selectedClipIds: [],
    markers: [{ id: 'm1', time: createRational(45, 30), name: 'Intro end', color: '#f59e0b' }],
    comments: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

function taggedAsset(): MediaAsset {
  return {
    id: 'a1', name: 'Interview_Take1.mp4', path: '/m/i.mp4', type: 'video',
    duration: '00:00:10', fingerprint: 'fp1', isOffline: false,
    scene: 'SC1', take: 2, rating: 5, tags: ['interview', 'selects'],
  };
}

function withAudioStreams(doc: unknown): string {
  const parsed = JSON.parse(JSON.stringify(doc)) as {
    media_pool: { audio_streams?: unknown[] }[];
  };
  for (const entry of parsed.media_pool) {
    entry.audio_streams = [{ stream_index: 1, codec: 'pcm', channels: 2, sample_rate: 48000 }];
  }
  return JSON.stringify(parsed);
}

describe('R24.7 — metadata and marker round-trip', () => {
  it('persists asset metadata and markers through project JSON', () => {
    const doc = JSON.parse(serializeProject(stateWithMarker(), [taggedAsset()]));
    expect(doc.media_pool[0].scene).toBe('SC1');
    expect(doc.media_pool[0].take).toBe(2);
    expect(doc.media_pool[0].rating).toBe(5);
    expect(doc.media_pool[0].tags).toEqual(['interview', 'selects']);
    expect(doc.sequences[0].markers).toEqual([
      { marker_id: 'm1', name: 'Intro end', color: '#f59e0b', time: { value: 45, rate: 30 } },
    ]);

    const { timelineState, assets } = deserializeProject(withAudioStreams(doc));
    expect(assets[0].scene).toBe('SC1');
    expect(assets[0].tags).toEqual(['interview', 'selects']);
    expect(timelineState.markers).toEqual([
      { id: 'm1', name: 'Intro end', color: '#f59e0b', time: createRational(45, 30) },
    ]);
  });

  it('omits empty markers and absent metadata cleanly', () => {
    const bare: TimelineState = { ...stateWithMarker(), markers: [] };
    const plain: MediaAsset = { ...taggedAsset(), scene: undefined, take: undefined, rating: undefined, tags: undefined };
    const doc = JSON.parse(serializeProject(bare, [plain]));
    expect('markers' in doc.sequences[0]).toBe(false);
    expect('scene' in doc.media_pool[0]).toBe(false);

    const { timelineState, assets } = deserializeProject(withAudioStreams(doc));
    expect(timelineState.markers).toEqual([]);
    expect(assets[0].scene).toBeUndefined();
  });
});
