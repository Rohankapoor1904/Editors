/**
 * R25.6 — AI music bed editor.
 *
 * Fits a music bed to an exact target duration with rational-time arithmetic
 * (AGENTS §5.1). Two honest strategies only:
 *   - `trim`  source longer than target → cut the tail (never pitch-shift).
 *   - `loop`  source shorter than target → tile the source; last pass is a
 *             partial head so the result hits the target exactly.
 * No time-stretch / pitch-shift DSP is invented: speed stays 1.0 so there are
 * no pitch artifacts (ROADMAP R25.6).
 */

import {
  RationalTime,
  createRational,
  addRational,
  subRational,
  compareRational,
  rationalToSeconds,
  rationalToFrames,
  secondsToRational,
} from '../types/time';
import { Clip, Track } from '../types/timeline';
import { Command } from '../core/commands';
import { CompoundCommand } from '../core/commands/transaction';
import { TrimCommand } from '../core/commands/edits';
import { AddClipCommand } from '../core/commands/storeCommands';

export type MusicBedEditMode = 'exact' | 'trim' | 'loop';

export interface MusicBedSegment {
  /** Source window start (seconds, absolute in the asset). */
  sourceStartSec: number;
  /** Source window end (seconds, absolute in the asset). */
  sourceEndSec: number;
  /** Where this segment sits on the timeline relative to the bed start. */
  timelineOffset: RationalTime;
  duration: RationalTime;
}

export interface MusicBedPlan {
  mode: MusicBedEditMode;
  /** Original source window used as the bed material. */
  sourceDuration: RationalTime;
  targetDuration: RationalTime;
  /** Always equals `targetDuration` (exact rational). */
  resultDuration: RationalTime;
  segments: MusicBedSegment[];
}

function findDuration(a: RationalTime, b: RationalTime): number {
  return compareRational(a, b);
}

/**
 * Plans how to fit `sourceDuration` material onto `targetDuration`.
 * Pure — no store access. Result duration is always the exact target.
 */
export function planMusicBedEdit(
  sourceDuration: RationalTime,
  targetDuration: RationalTime
): MusicBedPlan {
  if (sourceDuration.rate <= 0 || targetDuration.rate <= 0) {
    throw new Error('musicEditor: duration rate must be non-zero');
  }
  if (findDuration(sourceDuration, createRational(0, sourceDuration.rate)) <= 0) {
    throw new Error('musicEditor: source duration must be positive');
  }
  if (findDuration(targetDuration, createRational(0, targetDuration.rate)) <= 0) {
    throw new Error('musicEditor: target duration must be positive');
  }

  const cmp = findDuration(sourceDuration, targetDuration);
  const sourceSec = rationalToSeconds(sourceDuration);
  const targetSec = rationalToSeconds(targetDuration);

  if (cmp === 0) {
    return {
      mode: 'exact',
      sourceDuration,
      targetDuration,
      resultDuration: targetDuration,
      segments: [
        {
          sourceStartSec: 0,
          sourceEndSec: sourceSec,
          timelineOffset: createRational(0, targetDuration.rate),
          duration: targetDuration,
        },
      ],
    };
  }

  if (cmp > 0) {
    // Trim: use the first `target` seconds of the source.
    return {
      mode: 'trim',
      sourceDuration,
      targetDuration,
      resultDuration: targetDuration,
      segments: [
        {
          sourceStartSec: 0,
          sourceEndSec: targetSec,
          timelineOffset: createRational(0, targetDuration.rate),
          duration: targetDuration,
        },
      ],
    };
  }

  // Loop: ceil(target / source) passes; last pass truncated to hit target.
  const passes = Math.ceil(targetSec / sourceSec);
  const segments: MusicBedSegment[] = [];
  let cursor = createRational(0, targetDuration.rate);
  for (let i = 0; i < passes; i++) {
    const remaining = subRational(targetDuration, cursor);
    const full = createRational(sourceDuration.value, sourceDuration.rate);
    const useFull = findDuration(remaining, full) >= 0;
    const segDur = useFull ? full : remaining;
    const segSourceEnd = Math.min(sourceSec, rationalToSeconds(segDur));
    segments.push({
      sourceStartSec: 0,
      sourceEndSec: segSourceEnd,
      timelineOffset: cursor,
      duration: segDur,
    });
    cursor = addRational(cursor, segDur);
  }

  const resultDuration = segments.reduce(
    (acc, s) => addRational(acc, s.duration),
    createRational(0, targetDuration.rate)
  );

  if (findDuration(resultDuration, targetDuration) !== 0) {
    // Should be unreachable; fail loudly rather than ship a drifting bed.
    throw new Error(
      `musicEditor: plan drifted (got ${rationalToSeconds(resultDuration)}s, wanted ${targetSec}s)`
    );
  }

  return {
    mode: 'loop',
    sourceDuration,
    targetDuration,
    resultDuration,
    segments,
  };
}

/** Converts a plan to an undoable command sequence against a real bed clip. */
export function musicBedEditCommands(
  track: Track,
  bedClip: Clip,
  targetDuration: RationalTime,
  rate: number
): { plan: MusicBedPlan; commands: Command[]; transaction: Command } {
  const sourceDuration = subRational(bedClip.sourceOut, bedClip.sourceIn);
  if (findDuration(sourceDuration, createRational(0, rate)) <= 0) {
    throw new Error('musicEditor: bed clip has non-positive source window');
  }

  const plan = planMusicBedEdit(sourceDuration, targetDuration);
  const commands: Command[] = [];

  if (plan.mode === 'exact') {
    return { plan, commands, transaction: new CompoundCommand([]) };
  }

  if (plan.mode === 'trim') {
    const delta = subRational(targetDuration, sourceDuration); // negative
    commands.push(new TrimCommand(bedClip.id, 'out', delta));
    return { plan, commands, transaction: new CompoundCommand(commands) };
  }

  // loop: keep the first full/partial pass as the existing clip, append the rest.
  const first = plan.segments[0];
  const firstDur = first.duration;
  if (findDuration(firstDur, bedClip.duration) !== 0) {
    const delta = subRational(firstDur, bedClip.duration);
    commands.push(new TrimCommand(bedClip.id, 'out', delta));
  }

  let cursor = addRational(bedClip.startOffset, firstDur);
  for (let i = 1; i < plan.segments.length; i++) {
    const seg = plan.segments[i];
    const segClip: Clip = {
      id: `${bedClip.id}_loop${i}_${Math.round(rationalToSeconds(cursor) * 1000)}`,
      assetId: bedClip.assetId,
      name: `${bedClip.name} (loop ${i + 1})`,
      startOffset: cursor,
      sourceIn: secondsToRational(seg.sourceStartSec, rate),
      sourceOut: secondsToRational(seg.sourceEndSec, rate),
      duration: seg.duration,
      audioRole: bedClip.audioRole ?? 'music',
      volume: bedClip.volume,
      muted: bedClip.muted,
      pan: bedClip.pan,
      speed: 1.0,
    };
    commands.push(new AddClipCommand(track.id, segClip));
    cursor = addRational(cursor, seg.duration);
  }

  return { plan, commands, transaction: new CompoundCommand(commands) };
}

/** Finds the first music-role (or music-named) bed clip on the timeline. */
export function findMusicBedClip(tracks: Track[]): { track: Track; clip: Clip } | null {
  for (const track of tracks) {
    if (track.type !== 'audio' || track.muted || track.locked) continue;
    for (const clip of track.clips) {
      if (clip.muted) continue;
      if (clip.audioRole === 'music' || /music bed/i.test(clip.name)) {
        return { track, clip };
      }
    }
  }
  return null;
}

/** Result duration expressed in whole frames at `fps` (for ±1 frame checks). */
export function planDurationFrames(plan: MusicBedPlan, fps: number): number {
  return rationalToFrames(plan.resultDuration, fps);
}

/** Target duration helper: seconds → rational at the given sequence rate. */
export function targetFromSeconds(seconds: number, rate: number): RationalTime {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`musicEditor: invalid target seconds ${seconds}`);
  }
  return secondsToRational(seconds, rate);
}
