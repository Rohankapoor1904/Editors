import type { RGBColor } from './colorEngine';

/**
 * R24.2 — Match Color (Reinhard-style) + Auto Color (gray-world) solvers.
 *
 * Both solvers emit *ordinary* grade params (lift/gamma/gain/offset/
 * temperature/contrast/saturation) that travel the existing `colorGrade`
 * effect path — zero renderer changes, zero new uniforms. Matching works
 * on caller-supplied pixel stats, never on invented footage: empty inputs
 * throw, and a zero-variance channel degrades to a mean shift (gain 1)
 * instead of dividing by zero.
 */

export interface ChannelStats {
  mean: number;
  std: number;
}

export interface RGBStats {
  r: ChannelStats;
  g: ChannelStats;
  b: ChannelStats;
}

/** R24.2 — per-channel mean/std over caller-supplied samples. */
export function channelStats(values: number[]): ChannelStats {
  if (!values || values.length === 0) {
    throw new Error('colorMatch: need at least one sample for channel stats');
  }
  let sum = 0;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error('colorMatch: samples must be finite numbers');
    }
    sum += v;
  }
  const mean = sum / values.length;
  let sq = 0;
  for (const v of values) sq += (v - mean) * (v - mean);
  return { mean, std: Math.sqrt(sq / values.length) };
}

export function rgbStats(pixels: RGBColor[]): RGBStats {
  return {
    r: channelStats(pixels.map((p) => p.r)),
    g: channelStats(pixels.map((p) => p.g)),
    b: channelStats(pixels.map((p) => p.b)),
  };
}

function transferChannel(source: ChannelStats, ref: ChannelStats): { gain: number; offset: number } {
  // out = (x - srcMean) * (refStd / srcStd) + refMean.
  // A flat source channel carries no contrast to transfer: shift its mean
  // (gain 1) rather than dividing by zero or inventing spread.
  const gain = source.std > 1e-9 ? ref.std / source.std : 1;
  return { gain, offset: ref.mean - gain * source.mean };
}

/**
 * R24.2 — returns { gain, offset } per channel mapping source stats onto
 * reference stats. Applying the result through the normal grade path moves
 * the source distribution toward the reference (proven by test).
 */
export function computeMatchGrade(
  source: RGBStats,
  ref: RGBStats
): { gain: RGBColor; offset: RGBColor } {
  const r = transferChannel(source.r, ref.r);
  const g = transferChannel(source.g, ref.g);
  const b = transferChannel(source.b, ref.b);
  return {
    gain: { r: r.gain, g: g.gain, b: b.gain },
    offset: { r: r.offset, g: g.offset, b: b.offset },
  };
}

/**
 * R24.2 — gray-world white balance + exposure normalization.
 * A warm cast (rMean > bMean) yields a negative temperature, which cools
 * through the existing temperature stage; exposure recenters mid-gray via
 * offset. Gains are bounded so a pathological fixture cannot explode.
 */
export function computeAutoColorGrade(pixels: RGBColor[]): {
  temperature: number;
  offset: RGBColor;
} {
  const stats = rgbStats(pixels);
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const temperature = clamp((stats.b.mean - stats.r.mean) * 2, -1, 1);
  const luma = 0.2126 * stats.r.mean + 0.7152 * stats.g.mean + 0.0722 * stats.b.mean;
  const lift = clamp(0.18 - luma, -0.5, 0.5);
  return {
    temperature,
    offset: { r: lift, g: lift, b: lift },
  };
}
