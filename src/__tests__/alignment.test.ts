import { describe, it, expect, vi } from 'vitest';
import { deleteWordsFromTimeline } from '../services/alignment';
import { WordTimestamp } from '../services/whisperTranscriber';
import { rationalToSeconds } from '../types/time';

describe('Forced Alignment & Text-to-Timeline Binding (R6.2)', () => {
  it('deletes exactly the selected word audio range for a single word', () => {
    const rippleDelete = vi.fn();

    const allWords: WordTimestamp[] = [
      { id: 'w1', word: 'Hello', startTime: 1.0, endTime: 1.5, confidence: 1.0 },
      { id: 'w2', word: 'World', startTime: 2.0, endTime: 2.5, confidence: 1.0 },
    ];
    const selectedWords = [allWords[0]];

    const updatedWords = deleteWordsFromTimeline({ rippleDelete }, selectedWords, allWords);

    expect(rippleDelete).toHaveBeenCalledTimes(1);

    const [startArg, durationArg] = rippleDelete.mock.calls[0];
    expect(rationalToSeconds(startArg)).toBeCloseTo(1.0);
    expect(rationalToSeconds(durationArg)).toBeCloseTo(0.5);

    // Remaining word should be shifted left by 0.5s
    expect(updatedWords).toHaveLength(1);
    expect(updatedWords[0].id).toBe('w2');
    expect(updatedWords[0].startTime).toBeCloseTo(1.5);
    expect(updatedWords[0].endTime).toBeCloseTo(2.0);
  });

  it('merges contiguous words and deletes as a single block', () => {
    const rippleDelete = vi.fn();

    const allWords: WordTimestamp[] = [
      { id: 'w1', word: 'Hello', startTime: 1.0, endTime: 1.5, confidence: 1.0 },
      { id: 'w2', word: 'world', startTime: 1.5, endTime: 2.0, confidence: 1.0 }, // exact contiguous
      { id: 'w3', word: '!', startTime: 2.001, endTime: 2.5, confidence: 1.0 }, // slightly gapped (<= 0.001)
      { id: 'w4', word: 'next', startTime: 3.0, endTime: 3.5, confidence: 1.0 },
    ];
    const selectedWords = allWords.slice(0, 3);

    const updatedWords = deleteWordsFromTimeline({ rippleDelete }, selectedWords, allWords);

    expect(rippleDelete).toHaveBeenCalledTimes(1);

    const [startArg, durationArg] = rippleDelete.mock.calls[0];
    expect(rationalToSeconds(startArg)).toBeCloseTo(1.0);
    expect(rationalToSeconds(durationArg)).toBeCloseTo(1.5);

    // Remaining word should be shifted left by 1.5s
    expect(updatedWords).toHaveLength(1);
    expect(updatedWords[0].id).toBe('w4');
    expect(updatedWords[0].startTime).toBeCloseTo(1.5);
    expect(updatedWords[0].endTime).toBeCloseTo(2.0);
  });

  it('deletes disjoint words in reverse temporal order and updates remaining words properly', () => {
    const rippleDelete = vi.fn();

    const allWords: WordTimestamp[] = [
      { id: 'w1', word: 'First', startTime: 1.0, endTime: 2.0, confidence: 1.0 },
      { id: 'w_mid', word: 'Middle', startTime: 2.5, endTime: 3.5, confidence: 1.0 },
      { id: 'w2', word: 'Second', startTime: 4.0, endTime: 5.0, confidence: 1.0 },
      { id: 'w_end', word: 'End', startTime: 6.0, endTime: 7.0, confidence: 1.0 },
    ];
    const selectedWords = [allWords[0], allWords[2]];

    const updatedWords = deleteWordsFromTimeline({ rippleDelete }, selectedWords, allWords);

    // Should process the block at [4.0, 5.0] first, then [1.0, 2.0]
    expect(rippleDelete).toHaveBeenCalledTimes(2);

    // First call is for the later block
    const [startArg1, durationArg1] = rippleDelete.mock.calls[0];
    expect(rationalToSeconds(startArg1)).toBeCloseTo(4.0);
    expect(rationalToSeconds(durationArg1)).toBeCloseTo(1.0);

    // Second call is for the earlier block
    const [startArg2, durationArg2] = rippleDelete.mock.calls[1];
    expect(rationalToSeconds(startArg2)).toBeCloseTo(1.0);
    expect(rationalToSeconds(durationArg2)).toBeCloseTo(1.0);

    // Remaining words
    expect(updatedWords).toHaveLength(2);

    // Middle word is after the first delete (shift 1s) but before the second delete
    expect(updatedWords[0].id).toBe('w_mid');
    expect(updatedWords[0].startTime).toBeCloseTo(1.5);
    expect(updatedWords[0].endTime).toBeCloseTo(2.5);

    // End word is after both deletes (shift 1s + 1s = 2s)
    expect(updatedWords[1].id).toBe('w_end');
    expect(updatedWords[1].startTime).toBeCloseTo(4.0);
    expect(updatedWords[1].endTime).toBeCloseTo(5.0);
  });

  it('handles empty input cleanly', () => {
    const rippleDelete = vi.fn();
    const allWords = [{ id: 'w1', word: 'First', startTime: 1.0, endTime: 2.0, confidence: 1.0 }];
    const updatedWords = deleteWordsFromTimeline({ rippleDelete }, [], allWords);
    expect(rippleDelete).not.toHaveBeenCalled();
    expect(updatedWords).toEqual(allWords);
  });
});
