import { Clip } from '../types/timeline';

export interface SnapResult {
  snappedTime: number;
  isSnapped: boolean;
  targetTime: number | null;
}

/**
 * Proximity detection snapping algorithm for timeline dragging
 */
export function calculateMagneticSnap(
  dragTime: number,
  clips: Clip[],
  playheadTime: number,
  zoomLevel: number,
  thresholdPixels = 10
): SnapResult {
  const thresholdSeconds = thresholdPixels / zoomLevel;
  const snapTargets: number[] = [playheadTime, 0];

  clips.forEach((clip) => {
    snapTargets.push(clip.startOffset);
    snapTargets.push(clip.startOffset + clip.duration);
  });

  let closestTarget: number | null = null;
  let minDiff = Infinity;

  for (const target of snapTargets) {
    const diff = Math.abs(dragTime - target);
    if (diff <= thresholdSeconds && diff < minDiff) {
      minDiff = diff;
      closestTarget = target;
    }
  }

  if (closestTarget !== null) {
    return {
      snappedTime: closestTarget,
      isSnapped: true,
      targetTime: closestTarget,
    };
  }

  return {
    snappedTime: dragTime,
    isSnapped: false,
    targetTime: null,
  };
}
