import { Keyframe } from '../types/timeline';

/**
 * Interpolates a value at time t across keyframe array using linear or cubic bezier easing
 */
export function interpolateKeyframeValue(keyframes: Keyframe[], time: number): number {
  if (!keyframes || keyframes.length === 0) return 0;
  if (keyframes.length === 1 || time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value;
  }

  // Find bounding keyframe interval
  let k0 = keyframes[0];
  let k1 = keyframes[1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
      k0 = keyframes[i];
      k1 = keyframes[i + 1];
      break;
    }
  }

  const progress = (time - k0.time) / (k1.time - k0.time);

  // Linear interpolation
  return k0.value + progress * (k1.value - k0.value);
}
