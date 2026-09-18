import { describe, it, expect } from 'vitest';
import { autoReframeEngine } from '../engine/autoReframe';

describe('AutoReframeEngine (R6.6)', () => {
  it('keeps the subject strictly inside the crop window for every frame despite Kalman smoothing lag', () => {
    const sourceWidth = 1920;
    const sourceHeight = 1080;
    const targetAspect = 9 / 16;
    // const cropWidth = sourceHeight * targetAspect; // 1080 * (9/16) = 607.5

    // Create a high-variance / fast-moving trajectory that would normally cause
    // a basic EMA or Kalman filter to lag behind and lose the subject.
    const trajectory: { frameIndex: number; timestamp: number; subjectCenterX: number }[] = [];
    let currentX = 500;

    for (let i = 0; i < 100; i++) {
      // Sudden jumps to test constraint clamping
      if (i === 20) currentX = 1500;
      if (i === 40) currentX = 100;
      if (i === 60) currentX = 1800;
      if (i === 80) currentX = 200;

      // Add some random noise
      const noise = (Math.random() - 0.5) * 50;
      let subjectCenterX = currentX + noise;

      // Keep within bounds roughly
      subjectCenterX = Math.max(0, Math.min(sourceWidth, subjectCenterX));

      trajectory.push({
        frameIndex: i,
        timestamp: i * (1 / 60), // 60fps
        subjectCenterX,
      });

      // Normal movement
      currentX += 5;
    }

    const reframed = autoReframeEngine.calculateSmoothReframeTrajectory(
      trajectory,
      sourceWidth,
      sourceHeight,
      targetAspect
    );

    expect(reframed.length).toBe(trajectory.length);

    reframed.forEach((frame, idx) => {
      const original = trajectory[idx];

      // 1. Acceptance Criteria: 16:9→9:16 output keeps the subject inside the crop window for every frame
      expect(original.subjectCenterX).toBeGreaterThanOrEqual(frame.cropX);
      expect(original.subjectCenterX).toBeLessThanOrEqual(frame.cropX + frame.cropWidth);

      // 2. Crop window never exceeds source bounds
      expect(frame.cropX).toBeGreaterThanOrEqual(0);
      expect(frame.cropX + frame.cropWidth).toBeLessThanOrEqual(sourceWidth);

      // 3. Properties match
      expect(frame.frameIndex).toBe(original.frameIndex);
      expect(frame.timestamp).toBe(original.timestamp);
      expect(frame.subjectCenterX).toBe(original.subjectCenterX);
      expect(frame.targetAspect).toBe(targetAspect);
    });
  });

  it('handles empty trajectory safely', () => {
    const reframed = autoReframeEngine.calculateSmoothReframeTrajectory([], 1920, 1080);
    expect(reframed).toEqual([]);
  });
});
