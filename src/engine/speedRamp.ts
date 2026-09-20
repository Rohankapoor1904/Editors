import { RationalTime, rationalToSeconds, secondsToRational, createRational } from '../types/time';
import { Keyframe, SpeedRampConfig } from '../types/timeline';
import { evaluateEasing } from '../utils/keyframing';

export const MIN_SPEED = 0.25; // 25% slow-mo
export const MAX_SPEED = 4.0;  // 400% fast-forward

export const SPEED_PRESETS: number[] = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 4.0];

/**
 * Calculates greatest common divisor for rational simplification
 */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Converts a decimal speed into an exact rational fraction [numerator, denominator]
 */
export function speedToFraction(speed: number): [number, number] {
  const precision = 10000;
  const num = Math.round(speed * precision);
  const den = precision;
  const common = gcd(num, den);
  return [num / common, den / common];
}

/**
 * Recalculates clip duration in rational time for a constant speed factor.
 * Zero-drift rational arithmetic: (sourceDuration.value * den) / (sourceDuration.rate * num)
 */
export function calculateDurationForSpeed(
  sourceDuration: RationalTime,
  speed: number
): RationalTime {
  const clampedSpeed = Math.max(0.01, Math.min(100, Math.abs(speed)));
  const [num, den] = speedToFraction(clampedSpeed);

  // duration_new = (val / rate) / (num / den) = (val * den) / (rate * num)
  const newVal = sourceDuration.value * den;
  const newRate = sourceDuration.rate * num;

  const common = gcd(newVal, newRate);
  return createRational(newVal / common, newRate / common);
}

/**
 * Computes timeline duration for a multi-point velocity envelope.
 * Evaluates the integral of 1 / v(t) over the source duration using numerical quadrature.
 */
export function calculateTimelineDurationForEnvelope(
  sourceDuration: RationalTime,
  envelope: Keyframe[]
): RationalTime {
  const sourceDurationSec = Math.max(0.001, rationalToSeconds(sourceDuration));
  if (!envelope || envelope.length === 0) {
    return sourceDuration;
  }

  if (envelope.length === 1) {
    return calculateDurationForSpeed(sourceDuration, envelope[0].value);
  }

  // Numerical integration: 200 samples across the source duration
  const steps = 200;
  const dt = sourceDurationSec / steps;
  let totalTimelineSec = 0;

  for (let i = 0; i < steps; i++) {
    const tSource = (i + 0.5) * dt;
    const speed = getEnvelopeSpeedAtSourceTime(tSource, envelope, sourceDurationSec);
    const safeSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.abs(speed)));
    totalTimelineSec += dt / safeSpeed;
  }

  // Snap to sequence timebase (preserve source rate)
  const frames = Math.max(1, Math.round(totalTimelineSec * sourceDuration.rate));
  return createRational(frames, sourceDuration.rate);
}

/**
 * Evaluates the instantaneous speed multiplier from a velocity envelope at source time t.
 */
export function getEnvelopeSpeedAtSourceTime(
  sourceTimeSec: number,
  envelope: Keyframe[],
  totalSourceSec: number
): number {
  if (!envelope || envelope.length === 0) return 1.0;
  if (envelope.length === 1) return envelope[0].value;

  const normalizedT = Math.max(0, Math.min(totalSourceSec, sourceTimeSec));

  // Find bounding keyframes
  let k0 = envelope[0];
  let k1 = envelope[envelope.length - 1];

  for (let i = 0; i < envelope.length - 1; i++) {
    const t0 = rationalToSeconds(envelope[i].time);
    const t1 = rationalToSeconds(envelope[i + 1].time);
    if (normalizedT >= t0 && normalizedT <= t1) {
      k0 = envelope[i];
      k1 = envelope[i + 1];
      break;
    }
  }

  const t0 = rationalToSeconds(k0.time);
  const t1 = rationalToSeconds(k1.time);
  const segmentDuration = t1 - t0;

  if (segmentDuration <= 0.0001) {
    return k0.value;
  }

  const progress = Math.max(0, Math.min(1, (normalizedT - t0) / segmentDuration));
  const eased = evaluateEasing(k0.easing, progress);

  return k0.value + eased * (k1.value - k0.value);
}

/**
 * Maps a timeline playhead offset within a clip to the exact source media timestamp.
 * Handles constant speed, velocity envelopes, and reverse playback.
 */
export function mapTimelineToSourceTime(
  timelineOffset: RationalTime,
  sourceIn: RationalTime,
  sourceDuration: RationalTime,
  config: SpeedRampConfig = {}
): RationalTime {
  const timelineSec = Math.max(0, rationalToSeconds(timelineOffset));
  const sourceInSec = rationalToSeconds(sourceIn);
  const sourceDurationSec = rationalToSeconds(sourceDuration);

  let sourceOffsetSec = 0;

  if (config.envelope && config.envelope.length > 0) {
    // Integrate speed over timeline time to obtain source progress
    const steps = 100;
    const dt = timelineSec / steps;
    let accumulatedSourceSec = 0;

    for (let i = 0; i < steps; i++) {
      const currentSourceSec = Math.min(sourceDurationSec, accumulatedSourceSec);
      const speed = getEnvelopeSpeedAtSourceTime(currentSourceSec, config.envelope, sourceDurationSec);
      accumulatedSourceSec += dt * speed;
    }

    sourceOffsetSec = Math.min(sourceDurationSec, Math.max(0, accumulatedSourceSec));
  } else {
    const speed = Math.max(0.01, config.constantSpeed ?? 1.0);
    sourceOffsetSec = Math.min(sourceDurationSec, timelineSec * speed);
  }

  if (config.reverse) {
    sourceOffsetSec = Math.max(0, sourceDurationSec - sourceOffsetSec);
  }

  return secondsToRational(sourceInSec + sourceOffsetSec, sourceIn.rate);
}

/**
 * Returns the instantaneous audio playback rate for WebAudio or video player.
 */
export function getInstantaneousPlaybackRate(
  timelineOffset: RationalTime,
  config: SpeedRampConfig = {}
): number {
  let rate = config.constantSpeed ?? 1.0;

  if (config.envelope && config.envelope.length > 0) {
    const sourceOffset = mapTimelineToSourceTime(
      timelineOffset,
      createRational(0, timelineOffset.rate),
      createRational(100, timelineOffset.rate),
      config
    );
    rate = getEnvelopeSpeedAtSourceTime(
      rationalToSeconds(sourceOffset),
      config.envelope,
      100
    );
  }

  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.abs(rate)));
}

/**
 * Standard velocity speed ramp curve templates
 */
export type SpeedRampTemplate = 'slow-mo' | 'fast-forward' | 'freeze-ramp' | 'bullet-time';

export function createSpeedRampTemplate(
  template: SpeedRampTemplate,
  clipDuration: RationalTime
): Keyframe[] {
  const durSec = rationalToSeconds(clipDuration);
  const rate = clipDuration.rate;

  switch (template) {
    case 'slow-mo':
      return [
        { time: secondsToRational(0, rate), value: 1.0, easing: 'ease-in-out' },
        { time: secondsToRational(durSec * 0.3, rate), value: 0.25, easing: 'linear' },
        { time: secondsToRational(durSec * 0.7, rate), value: 0.25, easing: 'ease-in-out' },
        { time: secondsToRational(durSec, rate), value: 1.0, easing: 'linear' },
      ];
    case 'fast-forward':
      return [
        { time: secondsToRational(0, rate), value: 1.0, easing: 'ease-in' },
        { time: secondsToRational(durSec * 0.5, rate), value: 4.0, easing: 'ease-out' },
        { time: secondsToRational(durSec, rate), value: 1.0, easing: 'linear' },
      ];
    case 'freeze-ramp':
      return [
        { time: secondsToRational(0, rate), value: 1.0, easing: 'ease-in' },
        { time: secondsToRational(durSec * 0.4, rate), value: 0.25, easing: 'linear' },
        { time: secondsToRational(durSec * 0.6, rate), value: 2.0, easing: 'ease-out' },
        { time: secondsToRational(durSec, rate), value: 1.0, easing: 'linear' },
      ];
    case 'bullet-time':
      return [
        { time: secondsToRational(0, rate), value: 2.0, easing: 'ease-in-out' },
        { time: secondsToRational(durSec * 0.25, rate), value: 0.25, easing: 'linear' },
        { time: secondsToRational(durSec * 0.75, rate), value: 0.25, easing: 'ease-in-out' },
        { time: secondsToRational(durSec, rate), value: 2.0, easing: 'linear' },
      ];
  }
}
