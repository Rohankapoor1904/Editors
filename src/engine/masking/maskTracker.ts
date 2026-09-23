import { ClipMask } from '../../types/timeline';
import { validateMask } from './maskTypes';
import { LuminanceFrame, trackPoint } from './pointTracker';
import { NotImplementedError } from '../../services/runtimeConfig';

export interface MaskPropagation {
  /** Input mask translated to the current frame (shape/size preserved). */
  mask: ClipMask;
  /** NCC template-match confidence of the translation, -1..1. */
  confidence: number;
}

/**
 * R24.1 — propagates a mask centroid across one frame pair by tracking the
 * pixels under the previous centroid with normalized cross-correlation.
 * Shape, size and rotation are preserved; only the centroid moves, clamped
 * to normalized [0,1]. Low confidence means the caller should keyframe
 * manually — the tracker never smooths or extrapolates past the data.
 */
export function propagateMask(
  mask: ClipMask,
  prev: LuminanceFrame,
  curr: LuminanceFrame,
  frameWidth: number,
  frameHeight: number,
  templateHalfWidth = 8,
  searchRadius = 16
): MaskPropagation {
  validateMask(mask);
  if (!Number.isInteger(frameWidth) || frameWidth <= 0) {
    throw new Error('propagateMask: frameWidth must be a positive integer');
  }
  if (!Number.isInteger(frameHeight) || frameHeight <= 0) {
    throw new Error('propagateMask: frameHeight must be a positive integer');
  }
  if (prev.width !== frameWidth || prev.height !== frameHeight) {
    throw new Error('propagateMask: prev frame dimensions do not match frameWidth/frameHeight');
  }

  const seedX = mask.centerX * frameWidth;
  const seedY = mask.centerY * frameHeight;
  const tracked = trackPoint(prev, curr, seedX, seedY, templateHalfWidth, searchRadius);

  const dxNorm = (tracked.x - seedX) / frameWidth;
  const dyNorm = (tracked.y - seedY) / frameHeight;
  const next: ClipMask = {
    ...mask,
    centerX: Math.min(1, Math.max(0, mask.centerX + dxNorm)),
    centerY: Math.min(1, Math.max(0, mask.centerY + dyNorm)),
  };
  return { mask: next, confidence: tracked.score };
}

/**
 * R24.1 — neural subject segmentation entry point.
 *
 * No segmentation model is bundled with this build, so there is no honest
 * mask to return: this throws in every mode rather than fabricating a box
 * or trajectory. Manual masks (rect/ellipse) plus propagateMask() are the
 * supported path until a model ships with missing-model UX (R22.2 pattern).
 */
export function detectSubjectMask(): never {
  throw new NotImplementedError('mask auto-detect (neural segmentation)');
}
