import { EqBand } from './parametricEq';

/**
 * R24.3 — Dialogue Matcher: tone + level matching to a reference.
 *
 * Operates on caller-supplied per-band mean levels (dB), e.g. from
 * AnalyserNode frequency data in the app or synthetic fixtures in tests.
 * Emits clamped, smoothed EQ deltas plus a level offset — ordinary data
 * the existing EQ/volume path consumes. Empty or ragged input throws;
 * a single-band spike can never yank the whole curve (smoothing + clamp).
 */

export interface BandDelta {
  centerHz: number;
  gainDb: number;
}

/** R24.3 — level offset mapping target RMS onto reference RMS, dB. */
export function levelOffsetDb(targetRms: number, refRms: number, maxDb = 24): number {
  for (const [name, v] of [['targetRms', targetRms], ['refRms', refRms]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      throw new Error(`dialogueMatcher: ${name} must be a positive finite number`);
    }
  }
  const offset = 20 * Math.log10(refRms / targetRms);
  return Math.min(maxDb, Math.max(-maxDb, offset));
}

function checkBands(values: number[], label: string): void {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`dialogueMatcher: ${label} needs at least one band`);
  }
  for (let i = 0; i < values.length; i++) {
    if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) {
      throw new Error(`dialogueMatcher: ${label} band ${i} must be finite dB`);
    }
  }
}

/**
 * R24.3 — per-band (ref − target) deltas, clamped to ±maxDeltaDb and
 * smoothed with a [0.25, 0.5, 0.25] kernel so one noisy band cannot notch
 * its neighbours. Set smooth=false only in tests pinning raw transfer.
 */
export function matchTone(
  targetBandsDb: number[],
  refBandsDb: number[],
  centersHz: number[],
  maxDeltaDb = 12,
  smooth = true
): BandDelta[] {
  checkBands(targetBandsDb, 'target');
  checkBands(refBandsDb, 'reference');
  if (targetBandsDb.length !== refBandsDb.length || targetBandsDb.length !== centersHz.length) {
    throw new Error('dialogueMatcher: target, reference and centers must align 1:1');
  }
  const raw = targetBandsDb.map((t, i) => {
    const d = refBandsDb[i] - t;
    return Math.min(maxDeltaDb, Math.max(-maxDeltaDb, d));
  });
  const gains = smooth
    ? raw.map((v, i) => {
        const prev = raw[Math.max(0, i - 1)];
        const next = raw[Math.min(raw.length - 1, i + 1)];
        return 0.25 * prev + 0.5 * v + 0.25 * next;
      })
    : raw;
  return centersHz.map((centerHz, i) => ({ centerHz, gainDb: gains[i] }));
}

/**
 * R24.3 — converts deltas to peaking EqBands (centers must match exactly).
 */
export function deltasToEqBands(deltas: BandDelta[], q = 1.0): EqBand[] {
  return deltas.map((d) => {
    if (typeof d.centerHz !== 'number' || !Number.isFinite(d.centerHz) || d.centerHz <= 0) {
      throw new Error('dialogueMatcher: delta centerHz must be a positive finite frequency');
    }
    return { frequency: d.centerHz, gainDb: d.gainDb, q, type: 'peaking' as const };
  });
}

/**
 * R24.3 remainder — per-band levels (dBFS) via the Goertzel algorithm over
 * caller-supplied mono samples. A DFT bin is unnecessary here: Goertzel
 * evaluates exactly the requested centers in O(N·K). Coherently-sampled
 * tones (integer cycles in the window) read with zero leakage; anything
 * else leaks honestly like any rectangular-window analysis.
 */
export function bandLevelsDb(samples: Float32Array, sampleRate: number, centersHz: number[]): number[] {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error('dialogueMatcher: band analysis needs a non-empty Float32Array');
  }
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) {
      throw new Error(`dialogueMatcher: samples contain a non-finite value at ${i}`);
    }
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('dialogueMatcher: sampleRate must be positive and finite');
  }
  if (!Array.isArray(centersHz) || centersHz.length === 0) {
    throw new Error('dialogueMatcher: need at least one band center');
  }
  const n = samples.length;
  return centersHz.map((f) => {
    if (!Number.isFinite(f) || f <= 0 || f >= sampleRate / 2) {
      throw new Error('dialogueMatcher: band center must be within (0, nyquist)');
    }
    const omega = (2 * Math.PI * f) / sampleRate;
    const cosine = Math.cos(omega);
    const sine = Math.sin(omega);
    const coeff = 2 * cosine;
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const real = s1 * cosine - s2;
    const imag = s1 * sine;
    const magnitude = Math.sqrt(real * real + imag * imag);
    const amplitude = (2 * magnitude) / n;
    return 20 * Math.log10(amplitude + 1e-12);
  });
}
