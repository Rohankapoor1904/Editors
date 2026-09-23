import { describe, it, expect } from 'vitest';
import { selectedRanges, planPaperEditInsert, paperEditTransaction, PaperWord } from './paperEdit';
import { TimelineState, Track } from '../types/timeline';
import { createRational } from '../types/time';

const WORDS: PaperWord[] = [
  { id: 'w0', word: 'hello', startSec: 0.0, endSec: 0.4 },
  { id: 'w1', word: 'world', startSec: 0.5, endSec: 0.9 },
  { id: 'w2', word: 'this', startSec: 1.5, endSec: 1.7 },
  { id: 'w3', word: 'is', startSec: 1.8, endSec: 1.9 },
  { id: 'w4', word: 'cut', startSec: 2.0, endSec: 2.4 },
];

function emptyState(): TimelineState {
  const track: Track = {
    id: 'v1', type: 'video', index: 0, name: 'V1',
    muted: false, locked: false, solo: false, height: 64, clips: [],
  };
  return {
    version: '1.0.0',
    projectId: 'test-project',
    metadata: { name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'Rec.709' },
    playheadPosition: createRational(10, 1),
    inPoint: null,
    outPoint: null,
    targetTrackId: 'v1',
    tracks: [track],
    selectedClipIds: [],
    markers: [],
    comments: [],
    activeWorkspace: 'edit',
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

describe('R24.6 — transcript selection to exact ranges', () => {
  it('collapses contiguous words into one word-boundary run', () => {
    const segs = selectedRanges(WORDS, ['w0', 'w1']);
    expect(segs).toHaveLength(1);
    expect(segs[0].startSec).toBe(0.0);
    expect(segs[0].endSec).toBe(0.9);
    expect(segs[0].text).toBe('hello world');
  });

  it('splits on gaps and drops nothing selected', () => {
    const segs = selectedRanges(WORDS, ['w0', 'w2', 'w3', 'w4']);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startSec: 0.0, endSec: 0.4 });
    expect(segs[1]).toMatchObject({ startSec: 1.5, endSec: 2.4, text: 'this is cut' });
    expect(selectedRanges(WORDS, [])).toEqual([]);
  });

  it('rejects corrupt timestamps and unknown ids', () => {
    expect(() => selectedRanges([], ['w0'])).toThrow();
    expect(() => selectedRanges(WORDS, ['ghost'])).toThrow();
    expect(() =>
      selectedRanges([{ id: 'x', word: 'bad', startSec: 2, endSec: 1 }], ['x'])
    ).toThrow();
  });
});

describe('R24.6 — assembly inserts exact rational ranges in one undo', () => {
  it('places sequential subclips summing exactly to the spoken selection', () => {
    const segs = selectedRanges(WORDS, ['w0', 'w1', 'w3', 'w4']);
    const cmds = planPaperEditInsert(segs, { assetId: 'asset-7', trackId: 'v1', startAtSec: 10, rate: 30 });
    expect(cmds).toHaveLength(2);

    const tx = paperEditTransaction(cmds);
    const assembled = tx.apply(emptyState());
    const clips = assembled.tracks[0].clips;
    expect(clips).toHaveLength(2);
    // Run 1: 0.0–0.9s at 30fps; run 2 starts exactly where run 1 ends.
    expect(clips[0].duration).toEqual(createRational(27, 30));
    expect(clips[1].startOffset).toEqual(createRational(327, 30));
    expect(clips[1].duration).toEqual(createRational(18, 30));
    expect(clips[0].sourceIn).toEqual(createRational(0, 30));
    expect(clips[0].assetId).toBe('asset-7');

    // One undo reverts the whole assembly.
    expect(tx.invert(assembled).tracks[0].clips).toHaveLength(0);
  });

  it('refuses empty plans and degenerate segments loudly', () => {
    expect(() => planPaperEditInsert([], { assetId: 'a', trackId: 'v1', startAtSec: 0, rate: 30 })).toThrow();
    expect(() => paperEditTransaction([])).toThrow();
    expect(() =>
      planPaperEditInsert(
        [{ startSec: 1, endSec: 1, wordIds: [], text: '' }],
        { assetId: 'a', trackId: 'v1', startAtSec: 0, rate: 30 }
      )
    ).toThrow();
    expect(() =>
      planPaperEditInsert(selectedRanges(WORDS, ['w0']), { assetId: '', trackId: 'v1', startAtSec: 0, rate: 30 })
    ).toThrow();
  });
});
