import { describe, it, expect } from 'vitest';
import { scoreSegment } from '../segmentScorer';
import { assembleRoughCut } from '../roughCutAssembler';
import { ScoredTake } from '../roughCutAssembler';

describe('R25.1 — deterministic take scoring', () => {
  it('keeps dense conversational takes with exact reasons', () => {
    const score = scoreSegment({ speechWordCount: 20, durationSec: 10, silenceSec: 0.5 });
    expect(score.score).toBe(90); // 50 + 30 dense + 10 tight
    expect(score.verdict).toBe('keep');
    expect(score.reasons).toHaveLength(2);
  });

  it('drops dead air and penalizes gappy, clipped takes', () => {
    const dead = scoreSegment({ speechWordCount: 1, durationSec: 10, silenceSec: 8 });
    expect(dead.verdict).toBe('drop');
    expect(dead.score).toBeLessThan(25);

    const clipped = scoreSegment({
      speechWordCount: 20, durationSec: 10, silenceSec: 0,
      meanDb: -12, clippingRatio: 0.05,
    });
    // 50 + 30 + 10 − min(20, 10) = 80.
    expect(clipped.score).toBe(80);
    expect(clipped.verdict).toBe('keep');
  });

  it('rejects invalid features instead of scoring them', () => {
    expect(() => scoreSegment({ speechWordCount: 5, durationSec: 0, silenceSec: 0 })).toThrow();
    expect(() => scoreSegment({ speechWordCount: 5, durationSec: 5, silenceSec: 9 })).toThrow();
    expect(() => scoreSegment({ speechWordCount: NaN, durationSec: 5, silenceSec: 0 })).toThrow();
  });
});

describe('R25.1 — rough-cut assembly (acceptance: bad take excluded)', () => {
  function take(id: string, score: number, verdict: 'keep' | 'review' | 'drop', dur = 10): ScoredTake {
    return {
      assetId: id,
      assetName: `${id}.mp4`,
      sourceStartSec: 0,
      sourceEndSec: dur,
      score: { score, verdict, reasons: [] },
      transcriptText: `words for ${id}`,
      meanDb: -14,
    };
  }

  it('assembles 4 of 5 labelled takes, dropping the bad one, in input order', () => {
    const items = assembleRoughCut([
      take('good1', 90, 'keep'),
      take('bad', 10, 'drop'),
      take('good2', 70, 'keep'),
      take('iffy', 35, 'review'),
      take('good3', 85, 'keep'),
    ]);
    expect(items.map((i) => i.assetId)).toEqual(['good1', 'good2', 'iffy', 'good3']);
    // Auto trim toward -20 dBFS from measured -14: -6 dB, clamped.
    expect(items[0].volumeTrimDb).toBe(-6);
    expect(items[0].transitionAfter).toBe('cut');
  });

  it('throws when everything drops and validates takes', () => {
    expect(() => assembleRoughCut([take('bad', 5, 'drop')])).toThrow(/nothing to assemble/);
    expect(() => assembleRoughCut([])).toThrow();
    expect(() =>
      assembleRoughCut([{ ...take('x', 80, 'keep'), sourceEndSec: 0 }])
    ).toThrow();
  });
});
