import { InsertCommand } from '../../core/commands/edits';
import { CompoundCommand } from '../../core/commands/transaction';
import { RationalTime, createRational } from '../../types/time';
import { SegmentScore } from './segmentScorer';

/**
 * R25.1 — rough-cut assembly from scored takes.
 *
 * Drops `drop` verdicts, keeps input (chronological) order — the assembler
 * does NOT semantically reorder the story (documented limitation; an LLM
 * planner may reorder downstream by emitting its own plan). Each kept take
 * becomes one timeline insert with an audio level trim toward broadcast
 * dialogue (-20 dBFS) when a measured level exists, plus a recorded joint
 * transition for future render consumption.
 */

export interface ScoredTake {
  assetId: string;
  assetName: string;
  sourceStartSec: number;
  sourceEndSec: number;
  score: SegmentScore;
  transcriptText: string;
  /** Measured mean level, dBFS (drives the auto trim when present). */
  meanDb?: number;
}

export type JointTransition = 'cut' | 'cross-dissolve';

export interface AssemblyItem {
  assetId: string;
  name: string;
  sourceStartSec: number;
  durationSec: number;
  /** Auto level trim applied as clip volume, dB. */
  volumeTrimDb: number;
  transitionAfter: JointTransition;
}

export interface AssemblerOptions {
  /** Minimum take length in seconds (default 1). Shorter takes drop. */
  minTakeSec?: number;
  /** Joint between assembled takes (default 'cut'). */
  transition?: JointTransition;
  /** Level target for the auto trim, dBFS (default -20). */
  targetDb?: number;
}

function checkTake(t: ScoredTake, i: number): void {
  if (!t || typeof t.assetId !== 'string' || t.assetId.length === 0) {
    throw new Error(`autoEdit: take ${i} needs an assetId`);
  }
  for (const [name, v] of [['sourceStartSec', t.sourceStartSec], ['sourceEndSec', t.sourceEndSec]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
      throw new Error(`autoEdit: take ${i} has invalid ${name}`);
    }
  }
  if (t.sourceEndSec <= t.sourceStartSec) {
    throw new Error(`autoEdit: take ${i} has non-positive duration`);
  }
  if (!t.score || typeof t.score.score !== 'number') {
    throw new Error(`autoEdit: take ${i} carries no score`);
  }
}

/** R25.1 — filters, orders (stable input order) and annotates takes. */
export function assembleRoughCut(takes: ScoredTake[], opts: AssemblerOptions = {}): AssemblyItem[] {
  if (!Array.isArray(takes) || takes.length === 0) {
    throw new Error('autoEdit: need at least one take to assemble');
  }
  const minTakeSec = opts.minTakeSec ?? 1;
  const transition = opts.transition ?? 'cut';
  const targetDb = opts.targetDb ?? -20;
  if (!(minTakeSec > 0)) throw new Error('autoEdit: minTakeSec must be positive');
  if (transition !== 'cut' && transition !== 'cross-dissolve') {
    throw new Error("autoEdit: transition must be 'cut' or 'cross-dissolve'");
  }

  const items: AssemblyItem[] = [];
  takes.forEach((take, i) => {
    checkTake(take, i);
    if (take.score.verdict === 'drop') return;
    const durationSec = take.sourceEndSec - take.sourceStartSec;
    if (durationSec < minTakeSec) return;
    const volumeTrimDb =
      take.meanDb !== undefined
        ? Math.max(-12, Math.min(12, targetDb - take.meanDb))
        : 0;
    items.push({
      assetId: take.assetId,
      name: `${take.assetName} — “${take.transcriptText.slice(0, 48)}”`,
      sourceStartSec: take.sourceStartSec,
      durationSec,
      volumeTrimDb,
      transitionAfter: transition,
    });
  });
  if (items.length === 0) {
    throw new Error('autoEdit: every take was dropped — nothing to assemble (lower the threshold or add coverage)');
  }
  return items;
}

export interface AssemblyPlan {
  trackId: string;
  startAtSec: number;
  rate: number;
}

function toRational(seconds: number, rate: number): RationalTime {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('autoEdit: plan time must be a finite non-negative number');
  }
  return createRational(Math.round(seconds * rate), rate);
}

/**
 * R25.1 — plans one InsertCommand per item with sequential rational
 * cursors. Each clip carries the auto trim as volume plus a recorded
 * `transition` effect entry describing the outgoing joint (render
 * consumption deferred to DAG evaluation — the data is real regardless).
 */
export function planAssemblyInserts(items: AssemblyItem[], plan: AssemblyPlan): InsertCommand[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('autoEdit: need at least one item to plan');
  }
  if (!plan.trackId) throw new Error('autoEdit: trackId is required');
  if (!Number.isFinite(plan.startAtSec) || plan.startAtSec < 0) {
    throw new Error('autoEdit: startAtSec must be a finite non-negative number');
  }
  if (!Number.isInteger(plan.rate) || plan.rate <= 0) {
    throw new Error('autoEdit: rate must be a positive integer timebase');
  }
  let cursor = toRational(plan.startAtSec, plan.rate);
  return items.map((item, i) => {
    if (!(item.durationSec > 0)) throw new Error(`autoEdit: item ${i} has non-positive duration`);
    const duration = toRational(item.durationSec, plan.rate);
    const clip = {
      id: `autoedit_${Date.now()}_${i}`,
      assetId: item.assetId,
      name: item.name,
      startOffset: cursor,
      sourceIn: toRational(item.sourceStartSec, plan.rate),
      sourceOut: toRational(item.sourceStartSec + item.durationSec, plan.rate),
      duration,
      volume: item.volumeTrimDb,
      effects: [
        {
          id: `autoedit_transition_${i}`,
          type: 'transition',
          enabled: item.transitionAfter !== 'cut',
          params: { kind: item.transitionAfter, durationSec: 0.5 },
        },
      ],
    };
    cursor = createRational(cursor.value + duration.value, plan.rate);
    return new InsertCommand(plan.trackId, clip, false);
  });
}

/** R25.1 — wraps planned inserts so one undo reverts the whole assembly. */
export function assemblyTransaction(commands: InsertCommand[]): CompoundCommand {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw new Error('autoEdit: need at least one insert for a transaction');
  }
  return new CompoundCommand(commands);
}
