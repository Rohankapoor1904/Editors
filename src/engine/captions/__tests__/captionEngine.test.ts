import { describe, it, expect, vi } from 'vitest';
import {
  captionEngine,
  CaptionWord,
  CAPTION_PRESETS,
  CaptionPreset,
} from '../captionEngine';

describe('CaptionEngine', () => {
  const sampleWords: CaptionWord[] = [
    { id: '1', word: 'Transform', startTime: 1.0, endTime: 1.4 },
    { id: '2', word: 'your', startTime: 1.45, endTime: 1.7 },
    { id: '3', word: 'videos', startTime: 1.75, endTime: 2.2 },
    { id: '4', word: 'with', startTime: 2.25, endTime: 2.5 },
    { id: '5', word: 'viral', startTime: 2.55, endTime: 2.9 },
    // Gap > 0.6s to trigger natural pause splitting
    { id: '6', word: 'kinetic', startTime: 3.8, endTime: 4.2 },
    { id: '7', word: 'captions', startTime: 4.25, endTime: 4.8 },
  ];

  it('correctly calculates active word index for given timecodes', () => {
    expect(captionEngine.getActiveWordIndex(sampleWords, 0.5)).toBe(-1);
    expect(captionEngine.getActiveWordIndex(sampleWords, 1.2)).toBe(0);
    expect(captionEngine.getActiveWordIndex(sampleWords, 1.6)).toBe(1);
    expect(captionEngine.getActiveWordIndex(sampleWords, 2.0)).toBe(2);
    expect(captionEngine.getActiveWordIndex(sampleWords, 3.2)).toBe(-1);
    expect(captionEngine.getActiveWordIndex(sampleWords, 4.0)).toBe(5);
    expect(captionEngine.getActiveWordIndex(sampleWords, 5.5)).toBe(-1);
  });

  it('groups words into phrases and splits on natural pauses or maxWords limit', () => {
    // At t = 1.5s, should be in first phrase (words 1-5)
    const phrase1 = captionEngine.getPhraseForTimecode(sampleWords, 1.5, 5);
    expect(phrase1).not.toBeNull();
    expect(phrase1?.phraseWords.length).toBe(5);
    expect(phrase1?.phraseWords[0].word).toBe('Transform');
    expect(phrase1?.phraseWords[4].word).toBe('viral');
    expect(phrase1?.activeIndexInPhrase).toBe(1); // 'your'
    expect(phrase1?.progress).toBeGreaterThanOrEqual(0);
    expect(phrase1?.progress).toBeLessThanOrEqual(1);

    // At t = 4.0s, should be in second phrase after the 0.9s pause
    const phrase2 = captionEngine.getPhraseForTimecode(sampleWords, 4.0, 5);
    expect(phrase2).not.toBeNull();
    expect(phrase2?.phraseWords.length).toBe(2);
    expect(phrase2?.phraseWords[0].word).toBe('kinetic');
    expect(phrase2?.phraseWords[1].word).toBe('captions');
    expect(phrase2?.activeIndexInPhrase).toBe(0);
  });

  it('computes word progress linearly from 0.0 to 1.0 across word duration', () => {
    const midTime = 1.2; // sampleWords[0] is 1.0 to 1.4 (0.4s duration)
    const res = captionEngine.getPhraseForTimecode(sampleWords, midTime, 5);
    expect(res).not.toBeNull();
    expect(res?.activeIndexInPhrase).toBe(0);
    expect(res?.progress).toBeCloseTo(0.5, 1);
  });


  it('defines valid styling configurations for all viral presets', () => {
    const presets: CaptionPreset[] = ['hormozi', 'karaoke', 'neon', 'minimal'];
    presets.forEach((preset) => {
      const config = CAPTION_PRESETS[preset];
      expect(config).toBeDefined();
      expect(config.fontSize).toBeGreaterThan(20);
      expect(config.activeColor).toMatch(/^#/);
      expect(config.inactiveColor).toMatch(/^#/);
      expect(config.bounceScale).toBeGreaterThanOrEqual(0);
      expect(config.maxWordsPerLine).toBeGreaterThan(0);
    });

    expect(CAPTION_PRESETS.hormozi.uppercase).toBe(true);
    expect(CAPTION_PRESETS.hormozi.activeColor).toBe('#fde047');
    expect(CAPTION_PRESETS.karaoke.activeColor).toBe('#38bdf8');
    expect(CAPTION_PRESETS.neon.activeColor).toBe('#f43f5e');
  });

  it('renders kinetic captions to 2D canvas context with word highlights and bounce', () => {
    const fillTextCalls: { text: string; x: number; y: number }[] = [];
    const strokeTextCalls: { text: string; x: number; y: number }[] = [];
    const scaleCalls: { sx: number; sy: number }[] = [];

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn((sx, sy) => scaleCalls.push({ sx, sy })),
      measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
      fillText: vi.fn((text, x, y) => fillTextCalls.push({ text, x, y })),
      strokeText: vi.fn((text, x, y) => strokeTextCalls.push({ text, x, y })),
      font: '',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      textBaseline: '',
      textAlign: '',
      lineJoin: '',
      miterLimit: 0,
    } as unknown as CanvasRenderingContext2D;

    captionEngine.renderKineticCaptionsToCanvas(
      mockCtx,
      1920,
      1080,
      sampleWords,
      1.2, // Active on 'Transform'
      { preset: 'hormozi' }
    );

    expect(mockCtx.save).toHaveBeenCalled();
    expect(mockCtx.restore).toHaveBeenCalled();
    expect(fillTextCalls.length).toBe(5); // 5 words in phrase
    expect(fillTextCalls[0].text).toBe('TRANSFORM');
    expect(strokeTextCalls.length).toBe(5); // Hormozi has stroke outline
    expect(scaleCalls.length).toBe(1); // Bounce scale on active word
    expect(scaleCalls[0].sx).toBeGreaterThan(1.0); // Bounced > 1.0
  });

  it('returns valid WGSL caption shader source', () => {
    const wgsl = captionEngine.getWGSLShaderCode();
    expect(wgsl).toBeDefined();
    expect(typeof wgsl).toBe('string');
  });
});
