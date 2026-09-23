/**
 * R24.3 — sample-accurate dynamics oracles (compressor + de-esser).
 *
 * CPU reference implementations over caller-supplied Float32Arrays.
 * Non-destructive (inputs never mutated), deterministic, and honest about
 * their models in the comments below. The compressor maps 1:1 onto
 * DynamicsCompressorNode params for the live graph (see
 * compressorNodeConfig); the de-esser is an offline/bounce path — there is
 * no native de-esser node, and this file does not pretend otherwise.
 */

export interface CompressorSettings {
  thresholdDb: number;
  /** >= 1 (1 = no-op). */
  ratio: number;
  attackMs: number;
  releaseMs: number;
  /** Soft-knee half-width, dB, default 6. */
  kneeDb?: number;
  /** Applied after compression, dB, default 0. */
  makeupDb?: number;
}

export interface CompressionResult {
  output: Float32Array;
  /** Loudest instantaneous reduction observed, dB. */
  peakGainReductionDb: number;
  /** Mean reduction across all samples, dB. */
  meanGainReductionDb: number;
}

function checkSamples(samples: Float32Array, label: string): void {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error(`dynamics: ${label} needs a non-empty Float32Array`);
  }
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) {
      throw new Error(`dynamics: ${label} contains a non-finite sample at ${i}`);
    }
  }
}

export function validateCompressorSettings(s: CompressorSettings): void {
  const fail = (msg: string): never => {
    throw new Error(`dynamics: ${msg}`);
  };
  if (!Number.isFinite(s.thresholdDb)) fail('thresholdDb must be finite');
  if (!Number.isFinite(s.ratio) || s.ratio < 1) fail('ratio must be >= 1');
  if (!Number.isFinite(s.attackMs) || s.attackMs <= 0) fail('attackMs must be positive');
  if (!Number.isFinite(s.releaseMs) || s.releaseMs <= 0) fail('releaseMs must be positive');
  const knee = s.kneeDb ?? 6;
  if (!Number.isFinite(knee) || knee < 0) fail('kneeDb must be >= 0');
  if (s.makeupDb !== undefined && !Number.isFinite(s.makeupDb)) fail('makeupDb must be finite');
}

/**
 * R24.3 — feedforward compressor with a peak-hold level detector (instant
 * attack, release decay) driving a soft-knee gain computer, plus
 * attack/release ballistics on the applied gain. Peak-hold — not raw
 * rectified tracking — keeps periodic content from ratcheting the gain
 * downward (fast-attack pumping). Steady-state sine behaviour is pinned by
 * test: peak out ≈ threshold + (peakIn − threshold) / ratio.
 */
export function applyCompressor(
  samples: Float32Array,
  sampleRate: number,
  settings: CompressorSettings
): CompressionResult {
  checkSamples(samples, 'compressor input');
  validateCompressorSettings(settings);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('dynamics: sampleRate must be positive and finite');
  }
  const knee = settings.kneeDb ?? 6;
  const makeup = Math.pow(10, (settings.makeupDb ?? 0) / 20);
  const attackCoef = Math.exp(-1 / ((settings.attackMs / 1000) * sampleRate));
  const releaseCoef = Math.exp(-1 / ((settings.releaseMs / 1000) * sampleRate));

  const output = new Float32Array(samples.length);
  let gainEnv = 1; // smoothed linear gain, starts transparent
  let peakEnv = 0; // peak-hold level detector (instant attack, release decay)
  let peakGR = 0;
  let sumGR = 0;

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const ax = Math.abs(x);
    if (ax > peakEnv) {
      peakEnv = ax;
    } else {
      peakEnv *= releaseCoef;
    }
    const xDb = 20 * Math.log10(peakEnv + 1e-12);
    let grDb = 0;
    const over = xDb - settings.thresholdDb;
    if (knee > 0 && over > -knee / 2 && over < knee / 2) {
      grDb = ((1 - 1 / settings.ratio) * Math.pow(over + knee / 2, 2)) / (2 * knee);
    } else if (over >= knee / 2) {
      grDb = over * (1 - 1 / settings.ratio);
    }
    const target = Math.pow(10, -grDb / 20);
    const coef = target < gainEnv ? attackCoef : releaseCoef;
    gainEnv += (target - gainEnv) * (1 - coef);
    output[i] = x * gainEnv * makeup;

    const appliedDb = -20 * Math.log10(gainEnv + 1e-12);
    if (appliedDb > peakGR) peakGR = appliedDb;
    sumGR += appliedDb;
  }
  return { output, peakGainReductionDb: peakGR, meanGainReductionDb: sumGR / samples.length };
}

/**
 * R24.3 — maps compressor settings onto a live DynamicsCompressorNode.
 * The CPU oracle above remains the conformance reference for exact
 * steady-state behaviour; this mapping drives the audible graph.
 */
export function compressorNodeConfig(settings: CompressorSettings): {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
} {
  validateCompressorSettings(settings);
  return {
    threshold: settings.thresholdDb,
    knee: settings.kneeDb ?? 6,
    ratio: settings.ratio,
    attack: settings.attackMs / 1000,
    release: settings.releaseMs / 1000,
  };
}

export interface DeesserSettings {
  /** HF-envelope level engaging reduction, dBFS. */
  thresholdDb: number;
  /** 0..1 depth scale of the excess-driven reduction. */
  amount: number;
  attackMs: number;
  releaseMs: number;
}

export interface DeesserResult {
  output: Float32Array;
  peakReductionDb: number;
}

export function validateDeesserSettings(s: DeesserSettings): void {
  const fail = (msg: string): never => {
    throw new Error(`dynamics: ${msg}`);
  };
  if (!Number.isFinite(s.thresholdDb)) fail('thresholdDb must be finite');
  if (!Number.isFinite(s.amount) || s.amount < 0 || s.amount > 1) fail('amount must be within [0,1]');
  if (!Number.isFinite(s.attackMs) || s.attackMs <= 0) fail('attackMs must be positive');
  if (!Number.isFinite(s.releaseMs) || s.releaseMs <= 0) fail('releaseMs must be positive');
}

/**
 * R24.3 — wideband de-esser driven by a first-difference HF detector
 * (y[n] = x[n] − x[n−1]: a crude +6 dB/oct highpass, zero at DC — stated
 * plainly so nobody mistakes it for an FFT crossover). Reduction follows
 * the HF excess above threshold, scaled by amount, with ballistics.
 */
export function applyDeesser(
  samples: Float32Array,
  sampleRate: number,
  settings: DeesserSettings
): DeesserResult {
  checkSamples(samples, 'de-esser input');
  validateDeesserSettings(settings);
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('dynamics: sampleRate must be positive and finite');
  }
  const attackCoef = Math.exp(-1 / ((settings.attackMs / 1000) * sampleRate));
  const releaseCoef = Math.exp(-1 / ((settings.releaseMs / 1000) * sampleRate));

  const output = new Float32Array(samples.length);
  let gainEnv = 1;
  let peak = 0;
  let prev = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const hf = x - prev;
    prev = x;
    const hfDb = 20 * Math.log10(Math.abs(hf) + 1e-12);
    const excess = Math.max(0, hfDb - settings.thresholdDb);
    const target = Math.pow(10, (-excess * settings.amount) / 20);
    const coef = target < gainEnv ? attackCoef : releaseCoef;
    gainEnv += (target - gainEnv) * (1 - coef);
    output[i] = x * gainEnv;
    const appliedDb = -20 * Math.log10(gainEnv + 1e-12);
    if (appliedDb > peak) peak = appliedDb;
  }
  return { output, peakReductionDb: peak };
}
