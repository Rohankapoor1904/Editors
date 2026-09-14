export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MaskResult {
  confidence: number;
  maskDataUrl: string;
  bbox: BoundingBox;
}

export class Sam2MaskingEngine {
  /**
   * Invokes Segment Anything 2 (SAM 2) ONNX model for dynamic subject segmentation
   */
  async generateSubjectMask(
    _frameData: ImageData,
    clickPoint: { x: number; y: number }
  ): Promise<MaskResult> {
    console.log(`[SAM 2 Engine]: Generating dynamic mask for click point (${clickPoint.x}, ${clickPoint.y})...`);

    // Mock SAM 2 mask output for local development
    return {
      confidence: 0.96,
      maskDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      bbox: { x: 120, y: 80, width: 400, height: 800 },
    };
  }
}

export const sam2Engine = new Sam2MaskingEngine();
