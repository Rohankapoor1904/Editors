/**
 * R25.4 — beat-synced cut planner.
 *
 * Given real beat times (from BeatDetector over decoded samples — the
 * synthetic asset-hash fallback is NEVER consumed here), places cut
 * positions by snapping evenly-spread ideals to their nearest beat. Every
 * cut therefore lands within half a beat interval of a real transient
 * (pinned by test). Execution applies sequential SplitCommands (one undo
 * per cut, standard NLE behavior) — batch id-chaining is documented in
 * sceneDetect.cutTimes and not repeated here.
 */

function checkBeats(beats: number[]): number[] {
  if (!Array.isArray(beats) || beats.length < 1) {
    throw new Error('beatCut: need at least 1 beat time to cut against');
  }
  const sorted = [...beats].sort((a, b) => a - b);
  for (const b of sorted) {
    if (!Number.isFinite(b) || b < 0) {
      throw new Error('beatCut: beat times must be finite non-negative numbers');
    }
  }
  return sorted;
}

/** R25.4 — nearest beat to time t (throws on empty input). */
export function nearestBeat(t: number, beats: number[]): number {
  const sorted = checkBeats(beats);
  if (!Number.isFinite(t) || t < 0) {
    throw new Error('beatCut: time t must be a finite non-negative number');
  }
  let best = sorted[0];
  let bestDist = Math.abs(t - best);
  for (const b of sorted) {
    const d = Math.abs(t - b);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

/**
 * R25.4 — snaps maxCuts evenly-spread ideals onto beats inside
 * (0, durationSec), deduplicated and sorted. Fewer distinct snaps than
 * requested is reported by length, never padded.
 */
export function planBeatCuts(durationSec: number, beats: number[], maxCuts: number): number[] {
  const sorted = checkBeats(beats);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('beatCut: durationSec must be positive and finite');
  }
  if (!Number.isInteger(maxCuts) || maxCuts < 1) {
    throw new Error('beatCut: maxCuts must be a positive integer');
  }
  const inRange = sorted.filter((b) => b > 0 && b < durationSec);
  if (inRange.length === 0) {
    throw new Error('beatCut: no beats inside the clip range to cut on');
  }
  const cuts = new Set<number>();
  for (let i = 1; i <= maxCuts; i++) {
    const ideal = (durationSec * i) / (maxCuts + 1);
    cuts.add(nearestBeat(ideal, inRange));
  }
  return [...cuts].sort((a, b) => a - b);
}
