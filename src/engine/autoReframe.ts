export interface ReframeCropWindow {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  targetAspect: number; // e.g. 9/16 = 0.5625
}

export interface KeyframedCropWindow extends ReframeCropWindow {
  frameIndex: number;
  timestamp: number;
  subjectCenterX: number;
}

export class AutoReframeEngine {
  /**
   * Calculates optimal crop window to maintain subject in frame during 16:9 to 9:16 re-aspecting
   */
  calculateCropWindow(
    subjectCenterX: number,
    sourceWidth: number,
    sourceHeight: number,
    targetAspect = 9 / 16
  ): ReframeCropWindow {
    const cropWidth = sourceHeight * targetAspect;
    const cropHeight = sourceHeight;

    // Clamp center X within source bounds
    let cropX = subjectCenterX - cropWidth / 2;
    cropX = Math.max(0, Math.min(sourceWidth - cropWidth, cropX));

    return {
      cropX,
      cropY: 0,
      cropWidth,
      cropHeight,
      targetAspect,
    };
  }

  /**
   * Generates keyframed crop windows with Gaussian/EMA motion smoothing to avoid jittery camera pans
   */
  calculateSmoothReframeTrajectory(
    subjectTrajectory: { frameIndex: number; timestamp: number; subjectCenterX: number }[],
    sourceWidth: number,
    sourceHeight: number,
    targetAspect = 9 / 16,
    smoothingFactor = 0.15
  ): KeyframedCropWindow[] {
    console.log(`[Auto-Reframe Engine]: Smoothing trajectory across ${subjectTrajectory.length} frames...`);

    const result: KeyframedCropWindow[] = [];
    let smoothedX = subjectTrajectory.length > 0 ? subjectTrajectory[0].subjectCenterX : sourceWidth / 2;

    for (const point of subjectTrajectory) {
      // Exponential moving average filter for smooth panning
      smoothedX = smoothedX + smoothingFactor * (point.subjectCenterX - smoothedX);

      const rawCrop = this.calculateCropWindow(smoothedX, sourceWidth, sourceHeight, targetAspect);

      result.push({
        ...rawCrop,
        frameIndex: point.frameIndex,
        timestamp: point.timestamp,
        subjectCenterX: point.subjectCenterX,
      });
    }

    return result;
  }
}

export const autoReframeEngine = new AutoReframeEngine();
