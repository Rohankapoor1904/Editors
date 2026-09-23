/**
 * R24.3 remainder — single-exponential reverb decay estimator + matcher.
 *
 * Blind reverb estimation is genuinely hard; this module states its model
 * plainly: every tail is treated as ONE exponential decay (no early
 * reflections, no multi-slope rooms). estimateRt60 runs a Schroeder-style
 * reverse integral from the peak and extrapolates an RT20-style fit to
 * −60 dB. matchReverbDecay only ever DRIES (imposes a shorter decay via a
 * gain curve) — wettening would require inventing reflections, so a wetter
 * reference throws instead of fabricating a tail.
 */

function checkMono(samples: Float32Array, label: string): void {
  if (!(samples instanceof Float32Array) || samples.length < 64) {
    throw new Error(`reverbMatch: ${label} needs a Float32Array of at least 64 samples`);
  }
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) {
      throw new Error(`reverbMatch: ${label} contains a non-finite sample at ${i}`);
    }
  }
}

/**
 * R24.3 — RT60 estimate in seconds via reverse-integrated decay fit.
 * Fits log-energy between −5 and −35 dB below the peak and extrapolates
 * the slope to −60 dB (RT30-style, doubled). Throws on silence,
 * non-decaying material, or unusable fits.
 */
export function estimateRt60(samples: Float32Array, sampleRate: number): number {
  checkMono(samples, 'estimateRt60 input');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('reverbMatch: sampleRate must be positive and finite');
  }
  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) {
      peak = a;
      peakIdx = i;
    }
  }
  if (peak < 1e-6) throw new Error('reverbMatch: silence carries no decay to measure');

  const tail = samples.slice(peakIdx);
  // Genuine decay guard: the tail must actually die out (last tenth at
  // least 15 dB below the first tenth). A flat line or sustained tone
  // yields a Schroeder slope from buffer truncation, not from the room —
  // measuring RT60 of it would be fabrication.
  const tenth = Math.max(1, Math.floor(tail.length / 10));
  let first = 0;
  let last = 0;
  for (let i = 0; i < tenth; i++) {
    first += tail[i] * tail[i];
    last += tail[tail.length - 1 - i] * tail[tail.length - 1 - i];
  }
  if (first <= 0 || last <= 0 || 10 * Math.log10(last / first) > -15) {
    throw new Error('reverbMatch: tail shows no measurable decay (sustained or flat material)');
  }

  // Reverse-integrated energy from the peak (Schroeder), in dB rel. peak.
  const tailLen = tail.length;
  if (tailLen < 32) throw new Error('reverbMatch: tail after the peak is too short to fit');
  const energy = new Float64Array(tailLen);
  let acc = 0;
  for (let i = tailLen - 1; i >= 0; i--) {
    const v = samples[peakIdx + i];
    acc += v * v;
    energy[i] = acc;
  }
  const e0 = energy[0] > 0 ? energy[0] : 1e-18;
  const pts: { t: number; db: number }[] = [];
  for (let i = 0; i < tailLen; i++) {
    const db = 10 * Math.log10(Math.max(energy[i], 1e-18) / e0);
    if (db <= -5 && db >= -35) pts.push({ t: i / sampleRate, db });
  }
  if (pts.length < 2 || pts[pts.length - 1].t - pts[0].t <= 0) {
    throw new Error('reverbMatch: decay fit window is degenerate (no measurable slope)');
  }
  // Least-squares slope of dB over time.
  let sumT = 0;
  let sumDb = 0;
  for (const p of pts) {
    sumT += p.t;
    sumDb += p.db;
  }
  const meanT = sumT / pts.length;
  const meanDb = sumDb / pts.length;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.t - meanT) * (p.db - meanDb);
    den += (p.t - meanT) * (p.t - meanT);
  }
  if (den <= 0) throw new Error('reverbMatch: degenerate time spread in fit window');
  const slopeDbPerSec = num / den;
  if (slopeDbPerSec >= 0) throw new Error('reverbMatch: tail does not decay (non-positive slope)');
  return -60 / slopeDbPerSec;
}

/**
 * R24.3 — imposes the reference decay on a wetter target by multiplying an
 * exponential gain curve (single-pole model). Returns a new buffer; the
 * input is never mutated. Throws when the reference is wetter — that would
 * need synthesized reflections, which this engine refuses to invent.
 */
export function matchReverbDecay(
  target: Float32Array,
  targetRt60: number,
  refRt60: number,
  sampleRate: number
): Float32Array {
  checkMono(target, 'matchReverbDecay target');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error('reverbMatch: sampleRate must be positive and finite');
  }
  for (const [name, v] of [['targetRt60', targetRt60], ['refRt60', refRt60]] as const) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`reverbMatch: ${name} must be a positive finite RT60`);
    }
  }
  if (refRt60 > targetRt60 * 1.05) {
    throw new Error(
      `reverbMatch: reference (${refRt60.toFixed(2)}s) is wetter than target (${targetRt60.toFixed(2)}s) — reflections cannot be synthesized`
    );
  }
  const ln1000 = Math.log(1000);
  const tauT = targetRt60 / ln1000;
  const tauR = refRt60 / ln1000;
  const rate = 1 / tauR - 1 / tauT; // >= ~0 by the guard above
  const out = new Float32Array(target.length);
  for (let i = 0; i < target.length; i++) {
    const t = i / sampleRate;
    out[i] = target[i] * Math.max(Math.exp(-t * rate), 1e-4);
  }
  return out;
}
