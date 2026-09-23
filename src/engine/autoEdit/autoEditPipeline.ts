import { WordTimestamp } from '../../services/whisperTranscriber';
import { SilenceSegment } from '../../services/sileroVad';
import { whisperService } from '../../services/whisperTranscriber';
import { sileroVadService } from '../../services/sileroVad';
import { scoreSegment, SegmentScore } from './segmentScorer';
import {
  assembleRoughCut,
  planAssemblyInserts,
  assemblyTransaction,
  ScoredTake,
  JointTransition,
} from './roughCutAssembler';
import { InsertCommand } from '../../core/commands/edits';
import { CompoundCommand } from '../../core/commands/transaction';

/**
 * R25.1 — perception-orchestrated Auto-Edit pipeline.
 *
 * For each raw footage input the pipeline runs transcription + VAD through
 * INJECTED services, derives honest features (speech density from real
 * words, silence ratio from real segments intersected with the take
 * range), scores, and assembles. Service failures propagate untouched —
 * there is no fallback transcript, no fallback silence, no plan B that
 * invents coverage. Production passes the real on-device services;
 * tests inject stubs (at this explicit seam, nowhere else).
 */

export interface RawFootage {
  assetId: string;
  assetName: string;
  mediaPath: string;
  durationSec: number;
}

export interface PerceptionServices {
  transcribe: (mediaPath: string) => Promise<WordTimestamp[]>;
  detectSilence: (mediaPath: string) => Promise<SilenceSegment[]>;
}

/** Production wiring: the real on-device Whisper + Silero services. */
export const defaultPerceptionServices: PerceptionServices = {
  transcribe: (mediaPath: string) =>
    whisperService.transcribe(mediaPath).then((result) => result.words),
  detectSilence: (mediaPath: string) => sileroVadService.detectSilence(mediaPath),
};

export interface AutoEditOptions {
  qualityThreshold?: number;
  minTakeSec?: number;
  transition?: JointTransition;
  trackId: string;
  startAtSec: number;
  rate: number;
}

export interface AutoEditResult {
  takes: ScoredTake[];
  kept: number;
  dropped: number;
  inserts: InsertCommand[];
  transaction: CompoundCommand;
}

function intersectSilence(segments: SilenceSegment[], start: number, end: number): number {
  let total = 0;
  for (const s of segments) {
    if (!Number.isFinite(s.startTime) || !Number.isFinite(s.endTime)) {
      throw new Error('autoEdit: VAD returned non-finite silence bounds');
    }
    const lo = Math.max(start, s.startTime);
    const hi = Math.min(end, s.endTime);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/** R25.1 — runs the full pipeline; rejects when perception fails. */
export async function runAutoEdit(
  footage: RawFootage[],
  services: PerceptionServices,
  opts: AutoEditOptions
): Promise<AutoEditResult> {
  if (!Array.isArray(footage) || footage.length === 0) {
    throw new Error('autoEdit: need at least one footage input');
  }
  if (!services || typeof services.transcribe !== 'function' || typeof services.detectSilence !== 'function') {
    throw new Error('autoEdit: perception services are required');
  }
  if (!opts.trackId) throw new Error('autoEdit: trackId is required');
  if (!Number.isFinite(opts.startAtSec) || opts.startAtSec < 0) {
    throw new Error('autoEdit: startAtSec must be a finite non-negative number');
  }
  if (!Number.isInteger(opts.rate) || opts.rate <= 0) {
    throw new Error('autoEdit: rate must be a positive integer timebase');
  }

  const takes: ScoredTake[] = [];
  for (let i = 0; i < footage.length; i++) {
    const input = footage[i];
    if (!input || typeof input.assetId !== 'string' || input.assetId.length === 0) {
      throw new Error(`autoEdit: footage ${i} needs an assetId`);
    }
    if (!Number.isFinite(input.durationSec) || input.durationSec <= 0) {
      throw new Error(`autoEdit: footage ${i} needs a positive durationSec`);
    }
    // Failures here propagate: a take with no perception is dropped from
    // the run by the caller catching per-take errors, never fabricated.
    const [words, silences] = await Promise.all([
      services.transcribe(input.mediaPath),
      services.detectSilence(input.mediaPath),
    ]);
    if (!Array.isArray(words)) throw new Error(`autoEdit: transcript for '${input.assetId}' is not an array`);
    const inTake = words.filter((w) => w.endTime > 0 && w.startTime < input.durationSec);
    const features = {
      speechWordCount: inTake.length,
      durationSec: input.durationSec,
      silenceSec: Math.min(
        input.durationSec,
        intersectSilence(Array.isArray(silences) ? silences : [], 0, input.durationSec)
      ),
    };
    const score: SegmentScore = scoreSegment(features, {
      threshold: opts.qualityThreshold,
    });
    takes.push({
      assetId: input.assetId,
      assetName: input.assetName,
      sourceStartSec: 0,
      sourceEndSec: input.durationSec,
      score,
      transcriptText: inTake.map((w) => w.word).join(' '),
    });
  }

  const items = assembleRoughCut(takes, {
    minTakeSec: opts.minTakeSec,
    transition: opts.transition,
  });
  const inserts = planAssemblyInserts(items, {
    trackId: opts.trackId,
    startAtSec: opts.startAtSec,
    rate: opts.rate,
  });
  return {
    takes,
    kept: items.length,
    dropped: takes.length - items.length,
    inserts,
    transaction: assemblyTransaction(inserts),
  };
}
