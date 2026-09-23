/**
 * R25.1 — deterministic take-quality scoring for AI Auto-Edit.
 *
 * Scores a segment from REAL measured features only (speech density from
 * transcription, silence ratio from VAD, optional level/clipping stats).
 * Every rule is documented below with its weight; the verdict thresholds
 * are explicit. There is no learned model here and none is claimed — this
 * is the quality gate whose output the assembler trusts.
 */

export interface SegmentFeatures {
  speechWordCount: number;
  durationSec: number;
  /** Seconds classified silent inside the segment. */
  silenceSec: number;
  /** Mean dialogue level, dBFS (when measured). */
  meanDb?: number;
  /** Fraction of clipped samples 0..1 (when measured). */
  clippingRatio?: number;
}

export type TakeVerdict = 'keep' | 'review' | 'drop';

export interface SegmentScore {
  /** 0..100. */
  score: number;
  verdict: TakeVerdict;
  /** Human-readable rules that fired (surfaced in the Auto-Edit panel). */
  reasons: string[];
}

export interface ScorerOptions {
  /** Keep threshold (default 40); review band is [threshold-15, threshold). */
  threshold?: number;
}

function checkFeatures(f: SegmentFeatures): void {
  if (!f) throw new Error('autoEdit: segment features are required');
  for (const [name, v] of [
    ['speechWordCount', f.speechWordCount],
    ['durationSec', f.durationSec],
    ['silenceSec', f.silenceSec],
  ] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`autoEdit: ${name} must be a finite non-negative number`);
    }
  }
  if (f.durationSec <= 0) throw new Error('autoEdit: segment duration must be positive');
  if (f.silenceSec > f.durationSec) {
    throw new Error('autoEdit: silence cannot exceed segment duration');
  }
  if (f.meanDb !== undefined && !Number.isFinite(f.meanDb)) {
    throw new Error('autoEdit: meanDb must be finite when measured');
  }
  if (f.clippingRatio !== undefined && (!Number.isFinite(f.clippingRatio) || f.clippingRatio < 0 || f.clippingRatio > 1)) {
    throw new Error('autoEdit: clippingRatio must be within [0,1] when measured');
  }
}

/** R25.1 — scores one segment; pure and fully deterministic. */
export function scoreSegment(f: SegmentFeatures, opts: ScorerOptions = {}): SegmentScore {
  checkFeatures(f);
  const threshold = opts.threshold ?? 40;
  if (!Number.isFinite(threshold)) throw new Error('autoEdit: threshold must be finite');

  let score = 50;
  const reasons: string[] = [];
  const wps = f.speechWordCount / f.durationSec;
  const silenceRatio = f.silenceSec / f.durationSec;

  // Speech density: conversational 1.2–3.0 w/s is ideal; dead air tanks it.
  if (wps >= 1.2 && wps <= 3.0) {
    score += 30;
    reasons.push(`dense speech (${wps.toFixed(1)} w/s) +30`);
  } else if (wps >= 0.5) {
    score += 10;
    reasons.push(`sparse speech (${wps.toFixed(1)} w/s) +10`);
  } else {
    score -= 25;
    reasons.push(`dead air (${wps.toFixed(1)} w/s) -25`);
  }

  // Silence ratio: tight takes score, gappy ones sink.
  if (silenceRatio <= 0.1) {
    score += 10;
    reasons.push('tight (≤10% silence) +10');
  } else if (silenceRatio > 0.5) {
    const penalty = Math.round(30 * silenceRatio);
    score -= penalty;
    reasons.push(`gappy (${Math.round(silenceRatio * 100)}% silence) -${penalty}`);
  }

  // Fragments and overlong rambles need human eyes.
  if (f.durationSec < 1) {
    score -= 20;
    reasons.push('fragment (<1s) -20');
  } else if (f.durationSec > 45) {
    score -= 15;
    reasons.push('overlong (>45s) -15');
  }

  // Measured level health (only when the caller measured it).
  if (f.meanDb !== undefined) {
    if (f.meanDb < -40) {
      score -= 15;
      reasons.push(`buried level (${f.meanDb.toFixed(1)} dBFS) -15`);
    }
  }
  if (f.clippingRatio !== undefined && f.clippingRatio > 0.01) {
    const penalty = Math.min(20, Math.round(200 * f.clippingRatio));
    score -= penalty;
    reasons.push(`clipping (${(f.clippingRatio * 100).toFixed(1)}%) -${penalty}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: TakeVerdict = score >= threshold ? 'keep' : score >= threshold - 15 ? 'review' : 'drop';
  return { score, verdict, reasons };
}
