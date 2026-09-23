import { describe, it, expect } from 'vitest';
import {
  formatSrtTimestamp,
  formatVttTimestamp,
  wordsToCues,
  cuesToSrt,
  cuesToVtt,
  wordsToSidecar,
  parseSrt,
  parseSrtTimestamp,
  harvestCaptionWords,
} from '../sidecar';
import { CaptionWord } from '../captionEngine';
import { Track, Clip } from '../../../types/timeline';
import { createRational } from '../../../types/time';

const sampleWords: CaptionWord[] = [
  { id: 'w1', word: 'Transform', startTime: 1.0, endTime: 1.4 },
  { id: 'w2', word: 'your', startTime: 1.4, endTime: 1.7 },
  { id: 'w3', word: 'videos', startTime: 1.7, endTime: 2.2 },
  { id: 'w4', word: 'kinetic', startTime: 3.8, endTime: 4.2 },
  { id: 'w5', word: 'captions', startTime: 4.2, endTime: 4.8 },
];

function makeClip(id: string, words: CaptionWord[]): Clip {
  return {
    id,
    assetId: 'a1',
    name: 'clip',
    startOffset: createRational(0, 60000),
    sourceIn: createRational(0, 60000),
    sourceOut: createRational(10, 60000),
    duration: createRational(10, 60000),
    effects: [
      { id: 'cap', type: 'caption', enabled: true, params: { words } },
    ],
  };
}

describe('R25.6 — caption sidecar (SRT/VTT)', () => {
  it('formats SRT and VTT timestamps correctly', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatSrtTimestamp(1.5)).toBe('00:00:01,500');
    expect(formatSrtTimestamp(3661.25)).toBe('01:01:01,250');
    expect(formatVttTimestamp(1.5)).toBe('00:00:01.500');
    expect(() => formatSrtTimestamp(-1)).toThrow();
    expect(() => formatSrtTimestamp(NaN)).toThrow();
  });

  it('preserves single-word timing in word mode and round-trips through a parseable SRT (acceptance)', () => {
    const srt = wordsToSidecar(sampleWords, 'srt', 'word');
    const cues = parseSrt(srt);

    expect(cues).toHaveLength(sampleWords.length);
    for (let i = 0; i < sampleWords.length; i++) {
      expect(cues[i].text).toBe(sampleWords[i].word);
      // Timings match the transcript within 1 ms (formatting is ms-quantised).
      expect(Math.abs(cues[i].startSec - sampleWords[i].startTime)).toBeLessThanOrEqual(0.001);
      expect(Math.abs(cues[i].endSec - sampleWords[i].endTime)).toBeLessThanOrEqual(0.001);
    }
    // Structure: numbered blocks with --> timing lines.
    expect(srt).toMatch(/^1\n00:00:01,000 --> 00:00:01,400\nTransform\n/);
    expect(parseSrtTimestamp('01:02:03,004')).toBeCloseTo(3723.004, 6);
  });

  it('groups phrases on natural pauses while keeping word bounds', () => {
    const cues = wordsToCues(sampleWords, 'phrase', 5);
    // Gap 3.8 - 2.2 = 1.6s > 0.6s → two phrases.
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Transform your videos');
    expect(cues[0].startSec).toBe(1.0);
    expect(cues[0].endSec).toBe(2.2);
    expect(cues[1].text).toBe('kinetic captions');
    expect(cues[1].startSec).toBe(3.8);
    expect(cues[1].endSec).toBe(4.8);
  });

  it('emits a valid WEBVTT document', () => {
    const vtt = wordsToSidecar(sampleWords, 'vtt', 'word');
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:01.400');
    expect(vtt).toContain('Transform');
  });

  it('rejects empty or invalid word lists instead of writing a fake sidecar', () => {
    expect(() => wordsToSidecar([], 'srt')).toThrow(/no caption words/);
    expect(() =>
      wordsToCues([{ id: 'x', word: 'bad', startTime: 2, endTime: 1 }])
    ).toThrow(/invalid word timing/);
    expect(() => cuesToSrt([])).toThrow(/no cues/);
    expect(() => cuesToVtt([])).toThrow(/no cues/);
  });

  it('harvests enabled caption words from timeline tracks (acceptance path)', () => {
    const tracks: Track[] = [
      {
        id: 't1',
        type: 'video',
        index: 0,
        name: 'V1',
        muted: false,
        locked: false,
        solo: false,
        height: 64,
        clips: [makeClip('c1', sampleWords)],
      },
      {
        id: 't2',
        type: 'video',
        index: 1,
        name: 'V2',
        muted: true,
        locked: false,
        solo: false,
        height: 64,
        clips: [
          {
            ...makeClip('c2', [{ id: 'm', word: 'muted', startTime: 0, endTime: 1 }]),
          },
        ],
      },
    ];
    const words = harvestCaptionWords(tracks);
    expect(words.map((w) => w.word)).toEqual(['Transform', 'your', 'videos', 'kinetic', 'captions']);
    // Muted track's words must not leak into the sidecar.
    expect(words.some((w) => w.word === 'muted')).toBe(false);
    expect(() => harvestCaptionWords([])).toThrow(/no caption words/);
  });
});
