export interface ReframeCropWindow {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  targetAspect: number; // e.g. 9/16 = 0.5625
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
}

export const autoReframeEngine = new AutoReframeEngine();
