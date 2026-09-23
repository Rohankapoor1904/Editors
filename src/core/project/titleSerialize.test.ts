import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject } from './serialize';
import { TimelineState } from '../../types/timeline';
import { MediaAsset } from '../../store/mediaPool';
import { createRational } from '../../types/time';
import { createTitleClip, titleTemplate } from '../../engine/titles';

function titleState(): TimelineState {
  const tpl = titleTemplate('tpl-lower-third');
  const clip = createTitleClip({
    id: 'title-9',
    spec: { ...tpl.spec, text: 'Jane — Host', templateId: tpl.id },
    startOffset: createRational(30, 1),
    duration: createRational(4, 1),
  });
  return {
    version: '1.0.0',
    projectId: 'proj_titles',
    metadata: { name: 'T', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'sRGB' },
    playheadPosition: createRational(0, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'v1',
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64,
        clips: [clip],
      },
    ],
    selectedClipIds: [],
    markers: [],
    comments: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

function audioAsset(): MediaAsset {
  return {
    id: 'a1', name: 'VO.wav', path: '/media/VO.wav', type: 'audio',
    duration: '240/24', fingerprint: 'abc', isOffline: false,
  };
}

describe('R24.4 — title clips survive project JSON', () => {
  it('serializes as type Title with the spec and no asset reference', () => {
    const doc = JSON.parse(serializeProject(titleState(), [audioAsset()]));
    const item = doc.sequences[0].video_tracks[0].items[0];
    expect(item.type).toBe('Title');
    expect(item.clip_id).toBe('title-9');
    expect('asset_reference_id' in item).toBe(false);
    expect(item.title.text).toBe('Jane — Host');
    expect(item.title.font_family).toBe('Inter, sans-serif');
    expect(item.title.box).toEqual({ x: 0.06, y: 0.74, w: 0.5, h: 0.18 });
    expect(item.timeline_range.start_time).toEqual({ value: 30, rate: 1 });
  });

  it('deserializes back to an identical editable title clip', () => {
    const doc = JSON.parse(serializeProject(titleState(), [audioAsset()]));
    // Same workaround as the R22.6 suite: serialize drops audio_streams,
    // so the fixture carries the sample rate explicitly (pre-existing gap).
    for (const entry of doc.media_pool) {
      entry.audio_streams = [{ stream_index: 1, codec: 'pcm', channels: 2, sample_rate: 48000 }];
    }
    const { timelineState } = deserializeProject(JSON.stringify(doc));
    const clip = timelineState.tracks?.[0].clips[0];
    expect(clip?.id).toBe('title-9');
    expect(clip?.assetId).toBe('title://title-9');
    expect(clip?.title?.text).toBe('Jane — Host');
    expect(clip?.title?.templateId).toBe('tpl-lower-third');
    expect(clip?.title?.box).toEqual({ x: 0.06, y: 0.74, w: 0.5, h: 0.18 });
    expect(clip?.duration).toEqual(createRational(4, 1));
    expect(clip?.startOffset).toEqual(createRational(30, 1));
  });

  it('rejects a Title item with no spec and a Clip item with no asset', () => {
    const doc = JSON.parse(serializeProject(titleState(), [audioAsset()]));
    for (const entry of doc.media_pool) {
      entry.audio_streams = [{ stream_index: 1, codec: 'pcm', channels: 2, sample_rate: 48000 }];
    }
    const badTitle = JSON.parse(JSON.stringify(doc));
    delete badTitle.sequences[0].video_tracks[0].items[0].title;
    expect(() => deserializeProject(JSON.stringify(badTitle))).toThrow();

    const badClip = JSON.parse(JSON.stringify(doc));
    badClip.sequences[0].video_tracks[0].items[0] = {
      type: 'Clip',
      clip_id: 'c',
      source_range: { start_time: { value: 0, rate: 1 }, duration: { value: 1, rate: 1 } },
      timeline_range: { start_time: { value: 0, rate: 1 }, duration: { value: 1, rate: 1 } },
    };
    expect(() => deserializeProject(JSON.stringify(badClip))).toThrow();
  });
});
