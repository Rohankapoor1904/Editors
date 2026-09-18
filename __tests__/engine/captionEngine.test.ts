import { describe, it, expect } from 'vitest';
import { captionEngine } from '../../src/engine/captions/captionEngine';

describe('CaptionEngine', () => {
  it('returns -1 if no word is active', () => {
    const words = [
      { id: '1', word: 'Hello', startTime: 1, endTime: 2 },
      { id: '2', word: 'World', startTime: 3, endTime: 4 },
    ];
    expect(captionEngine.getActiveWordIndex(words, 0)).toBe(-1);
    expect(captionEngine.getActiveWordIndex(words, 2.5)).toBe(-1);
    expect(captionEngine.getActiveWordIndex(words, 5)).toBe(-1);
  });

  it('returns the correct index for an active word', () => {
    const words = [
      { id: '1', word: 'Hello', startTime: 1, endTime: 2 },
      { id: '2', word: 'World', startTime: 3, endTime: 4 },
    ];
    expect(captionEngine.getActiveWordIndex(words, 1.5)).toBe(0);
    expect(captionEngine.getActiveWordIndex(words, 3.5)).toBe(1);
    expect(captionEngine.getActiveWordIndex(words, 3)).toBe(1);
  });
});
