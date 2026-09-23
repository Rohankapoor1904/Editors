import { LuminanceFrame } from './masking/pointTracker';
import { RationalTime, createRational } from '../types/time';

/**
 * R24.6 — hard-cut scene detection on frame histograms.
 *
 * Compares consecutive frames with chi-square distance over coarse
 * luminance histograms (robust to in-shot motion that would drown a
 * pixel-diff), flagging boundaries above threshold with a minimum gap to
 * suppress multi-frame transition chatter. Optional per-frame audio energy
 * annotates (never gates) each cut with transient coincidence.
 */

export interface SceneCut {
  /** Index of the first frame of the new shot. */
  frameIndex: number;
  /** Chi-square distance that triggered the cut, 0..1. */
  strength: number;
  /** True when an audio energy transient coincides with the boundary. */
  audioTransient: boolean;
}

export interface SceneDetectOptions {
  bins?: number;
  /** Chi-square threshold in [0,1]. Default 0.25. */
  threshold?: number;
  /** Minimum frames between cuts. Default 3. */
  minGapFrames?: number;
  /** Per-frame audio energy (same length as frames); enables annotation. */
  audioEnergy?: number[];
}

function checkFrames(frames: LuminanceFrame[]): void {
  if (!Array.isArray(frames) || frames.length < 2) {
    throw new Error('sceneDetect: need at least 2 frames to detect cuts');
  }
  const { width, height } = frames[0];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f || f.width !== width || f.height !== height) {
      throw new Error(`sceneDetect: frame ${i} dimensions do not match the sequence`);
    }
    if (!f.data || f.data.length < width * height) {
      throw new Error(`sceneDetect: frame ${i} buffer is smaller than width*height`);
    }
    for (let p = 0; p < width * height; p++) {
      if (!Number.isFinite(f.data[p])) {
        throw new Error(`sceneDetect: frame ${i} contains a non-finite sample`);
      }
    }
  }
}

/** Normalized coarse luminance histogram over [0,255]. */
export function frameHistogram(frame: LuminanceFrame, bins = 32): Float64Array {
  if (!Number.isInteger(bins) || bins < 2) {
    throw new Error('sceneDetect: bins must be an integer >= 2');
  }
  const hist = new Float64Array(bins);
  const n = frame.width * frame.height;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(255, frame.data[i]));
    const b = Math.min(bins - 1, Math.floor((v / 256) * bins));
    hist[b]++;
  }
  for (let b = 0; b < bins; b++) hist[b] /= n;
  return hist;
}

/** Chi-square distance between normalized histograms, 0..1. */
export function histChiSquare(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) {
    throw new Error('sceneDetect: histograms must be non-empty and aligned');
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const denom = a[i] + b[i];
    if (denom > 0) {
      const diff = a[i] - b[i];
      sum += (diff * diff) / denom;
    }
  }
  return sum / 2;
}

function audioTransientAt(energy: number[], i: number): boolean {
  // Spike vs. local median (5-frame window excluding i); guarded floor.
  const window: number[] = [];
  for (let j = Math.max(0, i - 2); j <= Math.min(energy.length - 1, i + 2); j++) {
    if (j !== i) window.push(energy[j]);
  }
  window.sort((x, y) => x - y);
  const med = window[Math.floor(window.length / 2)] ?? 0;
  return energy[i] > Math.max(1e-6, med * 2.5);
}

/**
 * R24.6 — returns shot-start frame indices for a flattened frame sequence.
 * Pure computation over caller-supplied frames; throws on ragged input.
 */
export function detectSceneCuts(frames: LuminanceFrame[], opts: SceneDetectOptions = {}): SceneCut[] {
  checkFrames(frames);
  const bins = opts.bins ?? 32;
  const threshold = opts.threshold ?? 0.25;
  const minGap = opts.minGapFrames ?? 3;
  if (!(threshold > 0) || !(threshold <= 1)) {
    throw new Error('sceneDetect: threshold must be within (0,1]');
  }
  if (!Number.isInteger(minGap) || minGap < 1) {
    throw new Error('sceneDetect: minGapFrames must be an integer >= 1');
  }
  if (opts.audioEnergy !== undefined) {
    if (!Array.isArray(opts.audioEnergy) || opts.audioEnergy.length !== frames.length) {
      throw new Error('sceneDetect: audioEnergy must align 1:1 with frames');
    }
    for (let i = 0; i < opts.audioEnergy.length; i++) {
      if (!Number.isFinite(opts.audioEnergy[i]) || opts.audioEnergy[i] < 0) {
        throw new Error(`sceneDetect: audioEnergy[${i}] must be a finite non-negative number`);
      }
    }
  }

  const hists = frames.map((f) => frameHistogram(f, bins));
  const cuts: SceneCut[] = [];
  let lastCut = -minGap;
  for (let i = 1; i < frames.length; i++) {
    const strength = histChiSquare(hists[i - 1], hists[i]);
    if (strength >= threshold && i - lastCut >= minGap) {
      lastCut = i;
      cuts.push({
        frameIndex: i,
        strength,
        audioTransient: opts.audioEnergy ? audioTransientAt(opts.audioEnergy, i) : false,
      });
    }
  }
  return cuts;
}

/**
 * R24.6 — maps detected cuts to rational split times at the given fps for
 * stepping through with SplitCommand (one split per undo, or batched by
 * the caller). Batch application in one pass is deliberately NOT built
 * here: each split mints a new clip id, so chained ids must be resolved
 * between splits — that sequencing lives in the UI layer, not in a pure
 * function pretending ids are stable.
 */
export function cutTimes(cuts: SceneCut[], fps: number): RationalTime[] {
  if (!Array.isArray(cuts)) throw new Error('sceneDetect: cuts must be an array');
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('sceneDetect: fps must be a positive finite number');
  }
  const rate = Math.max(1, Math.round(fps));
  return cuts.map((c) => {
    if (!c || !Number.isInteger(c.frameIndex) || c.frameIndex <= 0) {
      throw new Error('sceneDetect: cut frameIndex must be a positive integer');
    }
    return createRational(c.frameIndex, rate);
  });
}
