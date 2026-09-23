import { describe, it, expect } from 'vitest';
import {
  buildReviewBundle,
  encodeReviewLink,
  decodeReviewLink,
  checkPublishReady,
  commentPayload,
} from './reviewShare';
import { PublishCompatibilityError, getPresetById } from '../engine/exportPresets';
import { serializeProject, deserializeProject } from '../core/project/serialize';
import { createRational } from '../types/time';
import { TimelineState, TimelineComment } from '../types/timeline';
import { MediaAsset } from '../store/mediaPool';

function baseState(comments: TimelineComment[]): TimelineState {
  return {
    version: '1.0.0',
    projectId: 'proj_review',
    metadata: {
      name: 'Review Test',
      fps: 30,
      width: 1080,
      height: 1920,
      sampleRate: 48000,
      colorSpace: 'Rec.709',
    },
    playheadPosition: createRational(0, 30),
    inPoint: null,
    outPoint: null,
    tracks: [],
    selectedClipIds: [],
    activeWorkspace: 'edit',
    markers: [],
    comments,
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

function comment(overrides: Partial<TimelineComment> = {}): TimelineComment {
  return {
    id: 'c1',
    time: createRational(90, 30),
    author: 'Alice',
    body: 'Tighten this cut',
    resolved: false,
    createdAt: '2026-09-23T12:00:00.000Z',
    ...overrides,
  };
}

describe('R26.5 — review share bundle + link', () => {
  it('builds a time-sorted bundle and round-trips through a share link', () => {
    const late = comment({ id: 'c2', time: createRational(300, 30), body: 'Later note' });
    const early = comment({ id: 'c1', time: createRational(30, 30), body: 'Early note' });
    const state = baseState([late, early]);

    const bundle = buildReviewBundle(state, undefined, '2026-09-23T12:00:00.000Z');
    expect(bundle.kind).toBe('cinecraft-review');
    expect(bundle.version).toBe(1);
    expect(bundle.comments.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(bundle.comments[0].timeSec).toBeCloseTo(1);

    const link = encodeReviewLink(bundle);
    expect(link.startsWith('cinecraft-review://v1/')).toBe(true);
    const decoded = decodeReviewLink(link);
    expect(decoded.comments).toEqual(bundle.comments);
    expect(decoded.projectId).toBe('proj_review');
  });

  it('rejects garbage links with clear errors', () => {
    expect(() => decodeReviewLink('https://example.com')).toThrow(/not a CineCraft review link/);
    expect(() => decodeReviewLink('cinecraft-review://v1/!!!')).toThrow(/invalid base64|not JSON|not a v1/);
  });

  it('commentPayload exposes rational + seconds', () => {
    const p = commentPayload(comment());
    expect(p.time).toEqual({ value: 90, rate: 30 });
    expect(p.timeSec).toBeCloseTo(3);
  });
});

describe('R26.5 — comment JSON round-trip (acceptance)', () => {
  it('adds a comment at a timecode, serializes, deserializes, seeks equivalent time', () => {
    const c = comment({ id: 'roundtrip', time: createRational(45, 30) });
    const state = baseState([c]);
    const assets: MediaAsset[] = [];
    const json = serializeProject(state, assets);
    const doc = JSON.parse(json);
    // deserialize requires a sample rate from the media pool
    doc.media_pool = [{
      asset_id: 'a1',
      name: 'clip.mp4',
      file_path: '/m/clip.mp4',
      checksum_sha256: 'fp1',
      audio_streams: [{ stream_index: 0, codec: 'aac', channels: 2, sample_rate: 48000 }],
    }];
    expect(doc.sequences[0].comments).toHaveLength(1);
    expect(doc.sequences[0].comments[0]).toMatchObject({
      comment_id: 'roundtrip',
      author: 'Alice',
      body: 'Tighten this cut',
      resolved: false,
      time: { value: 45, rate: 30 },
    });

    const { timelineState } = deserializeProject(JSON.stringify(doc));
    expect(timelineState.comments).toHaveLength(1);
    const rt = (timelineState.comments ?? [])[0];
    expect(rt.id).toBe('roundtrip');
    expect(rt.time).toEqual({ value: 45, rate: 30 });
    // Seek-on-click uses the same rational the store would set.
    expect(rt.time.value / rt.time.rate).toBeCloseTo(1.5);
  });

  it('omits empty comments cleanly', () => {
    const json = serializeProject(baseState([]), []);
    const doc = JSON.parse(json);
    expect('comments' in doc.sequences[0]).toBe(false);
    doc.media_pool = [{
      asset_id: 'a1',
      name: 'clip.mp4',
      file_path: '/m/clip.mp4',
      checksum_sha256: 'fp1',
      audio_streams: [{ stream_index: 0, codec: 'aac', channels: 2, sample_rate: 48000 }],
    }];
    const { timelineState } = deserializeProject(JSON.stringify(doc));
    expect(timelineState.comments ?? []).toEqual([]);
  });
});

describe('R26.5 — publish compatibility check (acceptance)', () => {
  it('rejects a vertical master for a landscape-only preset with a typed error', () => {
    const youtube = getPresetById('youtube_4k')!;
    expect(youtube.aspectRatio).toBe('16:9');
    let caught: unknown;
    try {
      checkPublishReady({ masterWidth: 1080, masterHeight: 1920, presetId: 'youtube_4k' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PublishCompatibilityError);
    const e = caught as PublishCompatibilityError;
    expect(e.code).toBe('ASPECT_MISMATCH');
    expect(e.presetId).toBe('youtube_4k');
    expect(e.message).toContain('1080x1920');
    expect(e.message).toContain('16:9');
  });

  it('accepts matching aspects and unknown preset ids fail typed', () => {
    expect(checkPublishReady({ masterWidth: 3840, masterHeight: 2160, presetId: 'youtube_4k' }).ok).toBe(true);
    expect(checkPublishReady({ masterWidth: 1080, masterHeight: 1920, presetId: 'tiktok_reels' }).ok).toBe(true);
    expect(() => checkPublishReady({ masterWidth: 1920, masterHeight: 1080, presetId: 'nope' })).toThrow(
      PublishCompatibilityError
    );
  });
});
