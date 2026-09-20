import { Clip } from '../types/timeline';
import { rationalToSeconds, addRational } from '../types/time';

export interface SnapResult {
  snappedTime: number;
  isSnapped: boolean;
  targetTime: number | null;
  snapType?: 'clip' | 'playhead' | 'beat';
}

/**
 * Proximity detection snapping algorithm for timeline dragging,
 * supporting clips, playhead, and musical beat markers.
 */
export function calculateMagneticSnap(
  dragTime: number,
  clips: Clip[],
  playheadTime: number,
  zoomLevel: number,
  thresholdPixels = 10,
  beatMarkers: number[] = []
): SnapResult {
  const thresholdSeconds = thresholdPixels / zoomLevel;
  const snapTargets: { time: number; type: 'clip' | 'playhead' | 'beat' }[] = [
    { time: playheadTime, type: 'playhead' },
    { time: 0, type: 'clip' },
  ];

  clips.forEach((clip) => {
    snapTargets.push({ time: rationalToSeconds(clip.startOffset), type: 'clip' });
    snapTargets.push({ time: rationalToSeconds(addRational(clip.startOffset, clip.duration)), type: 'clip' });
  });

  beatMarkers.forEach((beatTime) => {
    snapTargets.push({ time: beatTime, type: 'beat' });
  });

  let closestTarget: { time: number; type: 'clip' | 'playhead' | 'beat' } | null = null;
  let minDiff = Infinity;

  for (const target of snapTargets) {
    const diff = Math.abs(dragTime - target.time);
    if (diff <= thresholdSeconds && diff < minDiff) {
      minDiff = diff;
      closestTarget = target;
    }
  }

  if (closestTarget !== null) {
    return {
      snappedTime: closestTarget.time,
      isSnapped: true,
      targetTime: closestTarget.time,
      snapType: closestTarget.type,
    };
  }

  return {
    snappedTime: dragTime,
    isSnapped: false,
    targetTime: null,
  };
}

