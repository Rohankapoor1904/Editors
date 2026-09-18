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

export interface TrackedFrameMask {
  frameIndex: number;
  timestamp: number;
  confidence: number;
  bbox: BoundingBox;
  maskDataUrl: string;
}
