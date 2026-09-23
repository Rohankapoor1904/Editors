import { InsertCommand } from '../core/commands/edits';
import { CompoundCommand } from '../core/commands/transaction';
import { RationalTime, createRational } from '../types/time';

/**
 * R24.6 — Paper Edit: transcript selection → timeline assembly.
 *
 * Selected words collapse into contiguous runs (by transcript order);
 * each run becomes one subclip of the source asset placed sequentially
 * from the insert point. Ranges are exact word boundaries — the engine
 * never pads, snaps, or invents handles. The returned InsertCommands are
 * wrapped in a single CompoundCommand downstream so assembly is one undo.
 *
 * The store holds a single sequence, so "new sequence" means contiguous
 * inserts at the playhead (documented); multi-sequence support is deferred.
 */

export interface PaperWord {
  id: string;
  word: string;
  startSec: number;
  endSec: number;
}

export interface PaperSegment {
  startSec: number;
  endSec: number;
  wordIds: string[];
  text: string;
}

function checkWords(words: PaperWord[]): void {
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('paperEdit: need at least one transcript word');
  }
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w || typeof w.id !== 'string' || typeof w.word !== 'string') {
      throw new Error(`paperEdit: word ${i} is missing id/word`);
    }
    if (!Number.isFinite(w.startSec) || !Number.isFinite(w.endSec)) {
      throw new Error(`paperEdit: word '${w.id}' has non-finite timestamps`);
    }
    if (w.endSec < w.startSec) {
      throw new Error(`paperEdit: word '${w.id}' ends before it starts`);
    }
  }
}

/**
 * R24.6 — collapses a word-id selection into exact word-boundary runs.
 * Unknown ids throw (a selection must reference the transcript); an empty
 * selection yields zero segments (the UI disables Assemble in that case).
 */
export function selectedRanges(words: PaperWord[], selectedIds: string[]): PaperSegment[] {
  checkWords(words);
  if (!Array.isArray(selectedIds)) {
    throw new Error('paperEdit: selectedIds must be an array');
  }
  const selected = new Set(selectedIds);
  for (const id of selected) {
    if (!words.some((w) => w.id === id)) {
      throw new Error(`paperEdit: selected id '${id}' is not in the transcript`);
    }
  }
  const segments: PaperSegment[] = [];
  let run: PaperWord[] | null = null;
  const flush = (): void => {
    if (run && run.length > 0) {
      segments.push({
        startSec: run[0].startSec,
        endSec: run[run.length - 1].endSec,
        wordIds: run.map((w) => w.id),
        text: run.map((w) => w.word).join(' '),
      });
    }
    run = null;
  };
  for (const w of words) {
    if (selected.has(w.id)) {
      if (!run) run = [];
      run.push(w);
    } else {
      flush();
    }
  }
  flush();
  return segments;
}

export interface PaperAssemblyPlan {
  assetId: string;
  trackId: string;
  /** Insert cursor in seconds; advances per segment. */
  startAtSec: number;
  /** Rational timebase rate (project fps) for exact arithmetic. */
  rate: number;
  namePrefix?: string;
  rippleAllTracks?: boolean;
}

function toRational(seconds: number, rate: number): RationalTime {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('paperEdit: segment time must be a finite non-negative number');
  }
  return createRational(Math.round(seconds * rate), rate);
}

/**
 * R24.6 — plans one InsertCommand per segment, cursors advancing by exact
 * rational durations. Durations sum exactly to the spoken selection —
 * verified by test against float accumulation.
 */
export function planPaperEditInsert(segments: PaperSegment[], plan: PaperAssemblyPlan): InsertCommand[] {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('paperEdit: need at least one segment to assemble');
  }
  if (!plan.assetId) throw new Error('paperEdit: assetId is required');
  if (!plan.trackId) throw new Error('paperEdit: trackId is required');
  if (!Number.isFinite(plan.startAtSec) || plan.startAtSec < 0) {
    throw new Error('paperEdit: startAtSec must be a finite non-negative number');
  }
  if (!Number.isInteger(plan.rate) || plan.rate <= 0) {
    throw new Error('paperEdit: rate must be a positive integer timebase');
  }
  const prefix = plan.namePrefix ?? 'PaperEdit';
  let cursor = toRational(plan.startAtSec, plan.rate);
  return segments.map((seg, i) => {
    if (!(seg.endSec > seg.startSec)) {
      throw new Error('paperEdit: refusing a zero-length insert (degenerate timestamps)');
    }
    const duration = toRational(seg.endSec - seg.startSec, plan.rate);
    const clip = {
      id: `paper_${Date.now()}_${i}`,
      assetId: plan.assetId,
      name: `${prefix} ${i + 1}: ${seg.text.slice(0, 40)}`,
      startOffset: cursor,
      sourceIn: toRational(seg.startSec, plan.rate),
      sourceOut: toRational(seg.endSec, plan.rate),
      duration,
    };
    cursor = createRational(cursor.value + duration.value, plan.rate);
    return new InsertCommand(plan.trackId, clip, plan.rippleAllTracks ?? false);
  });
}

/** R24.6 — wraps planned inserts so one undo reverts the whole assembly. */
export function paperEditTransaction(commands: InsertCommand[]): CompoundCommand {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('paperEdit: need at least one insert for a transaction');
  }
  return new CompoundCommand(commands);
}
