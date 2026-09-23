import { describe, it, expect } from 'vitest';
import { runAutoEdit, RawFootage, PerceptionServices } from '../autoEditPipeline';
import { WordTimestamp } from '../../../services/whisperTranscriber';
import { SilenceSegment } from '../../../services/sileroVad';
import { TimelineState, Track } from '../../../types/timeline';
import { createRational } from '../../../types/time';

function words(count: number, spanSec: number): WordTimestamp[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `w${i}`,
    word: `word${i}`,
    startTime: (spanSec * i) / count,
    endTime: (spanSec * (i + 1)) / count,
    confidence: 0.9,
  }));
}

function stubServices(
  wordsPerAsset: Record<string, WordTimestamp[]>,
  silencesPerAsset: Record<string, SilenceSegment[]> = {},
  failOn?: string
): PerceptionServices {
  return {
    transcribe: (path: string) => {
      if (failOn === path) return Promise.reject(new Error('stt_unavailable: model missing'));
      const words = Object.entries(wordsPerAsset).find(([asset]) => path.includes(asset))?.[1] ?? [];
      return Promise.resolve(words);
    },
    detectSilence: (path: string) => {
      if (failOn === path) return Promise.reject(new Error('vad_unavailable: model missing'));
      const segs = Object.entries(silencesPerAsset).find(([asset]) => path.includes(asset))?.[1] ?? [];
      return Promise.resolve(segs);
    },
  };
}

function emptyState(): TimelineState {
  const track: Track = {
    id: 'v1', type: 'video', index: 0, name: 'V1',
    muted: false, locked: false, solo: false, height: 64, clips: [],
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

const FOOTAGE: RawFootage[] = [
  { assetId: 'a1', assetName: 'Take1.mp4', mediaPath: '/m/a1.mp4', durationSec: 10 },
  { assetId: 'a2', assetName: 'Take2.mp4', mediaPath: '/m/a2.mp4', durationSec: 10 },
];

describe('R25.1 — orchestrated pipeline with injected perception', () => {
  it('keeps the speaking take, drops the silent one, one undo reverts all', async () => {
    const services = stubServices(
      { a1: words(20, 10), a2: [] },
      { a1: [{ startTime: 9.5, endTime: 10, duration: 0.5 }], a2: [{ startTime: 0, endTime: 10, duration: 10 }] }
    );
    const result = await runAutoEdit(FOOTAGE, services, {
      trackId: 'v1', startAtSec: 0, rate: 30,
    });
    expect(result.kept).toBe(1);
    expect(result.dropped).toBe(1);
    expect(result.takes.find((t) => t.assetId === 'a1')?.score.verdict).toBe('keep');
    expect(result.takes.find((t) => t.assetId === 'a2')?.score.verdict).toBe('drop');

    const assembled = result.transaction.apply(emptyState());
    expect(assembled.tracks[0].clips).toHaveLength(1);
    expect(assembled.tracks[0].clips[0].assetId).toBe('a1');
    expect(result.transaction.invert(assembled).tracks[0].clips).toHaveLength(0);
  });

  it('propagates perception failure instead of fabricating coverage', async () => {
    const services = stubServices({ a1: words(20, 10) }, {}, '/m/a2.mp4');
    await expect(
      runAutoEdit(FOOTAGE, services, { trackId: 'v1', startAtSec: 0, rate: 30 })
    ).rejects.toThrow(/_unavailable/);
  });

  it('rejects empty footage and missing plan plumbing loudly', async () => {
    const services = stubServices({});
    await expect(
      runAutoEdit([], services, { trackId: 'v1', startAtSec: 0, rate: 30 })
    ).rejects.toThrow(/at least one footage/);
    await expect(
      runAutoEdit(FOOTAGE, services, { trackId: '', startAtSec: 0, rate: 30 })
    ).rejects.toThrow(/trackId/);
  });
});
