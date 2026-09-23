import { ColorGradeSettings, colorEngine, RGBColor } from './colorEngine';

/**
 * R26.3 — CPU comparison renderer: grades one frame buffer twice (A/B)
 * for side-by-side or split-wipe preview. Operates on plain RGBA buffers
 * (no DOM dependency) so the math is exactly unit-testable; the
 * ComparisonView component only blits the results. Pure and
 * non-destructive — the input is never mutated, and A never leaks into B.
 */

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type CompareMode = 'side-by-side' | 'split' | 'a-only' | 'b-only';

function checkBuffer(buf: PixelBuffer, label: string): void {
  if (!buf || !Number.isInteger(buf.width) || buf.width <= 0) {
    throw new Error(`compare: ${label} has invalid width`);
  }
  if (!Number.isInteger(buf.height) || buf.height <= 0) {
    throw new Error(`compare: ${label} has invalid height`);
  }
  if (!(buf.data instanceof Uint8ClampedArray) || buf.data.length !== buf.width * buf.height * 4) {
    throw new Error(`compare: ${label} data must be RGBA with length width*height*4`);
  }
}

function gradeBuffer(frame: PixelBuffer, grade: ColorGradeSettings | null): PixelBuffer {
  const out = new Uint8ClampedArray(frame.data.length);
  for (let i = 0; i < frame.width * frame.height; i++) {
    const rgb: RGBColor = {
      r: frame.data[i * 4] / 255,
      g: frame.data[i * 4 + 1] / 255,
      b: frame.data[i * 4 + 2] / 255,
    };
    const graded = grade ? colorEngine.evaluateColorOnCPU(rgb, grade) : rgb;
    out[i * 4] = Math.round(graded.r * 255);
    out[i * 4 + 1] = Math.round(graded.g * 255);
    out[i * 4 + 2] = Math.round(graded.b * 255);
    out[i * 4 + 3] = 255;
  }
  return { width: frame.width, height: frame.height, data: out };
}

export interface CompareResult {
  left: PixelBuffer;
  right: PixelBuffer;
}

/**
 * R26.3 — renders both grades; side-by-side returns full frames,
 * split composites A left of splitX and B right of it into both halves.
 * A null grade means bypass (identity).
 */
export function renderComparison(
  frame: PixelBuffer,
  gradeA: ColorGradeSettings | null,
  gradeB: ColorGradeSettings | null,
  mode: CompareMode,
  splitX = 0.5
): CompareResult {
  checkBuffer(frame, 'compare input');
  if (mode !== 'side-by-side' && mode !== 'split' && mode !== 'a-only' && mode !== 'b-only') {
    throw new Error(`compare: unknown mode '${String(mode)}'`);
  }
  if (typeof splitX !== 'number' || !Number.isFinite(splitX) || splitX < 0 || splitX > 1) {
    throw new Error('compare: splitX must be within [0,1]');
  }
  const renderedA = gradeBuffer(frame, gradeA);
  const renderedB = gradeBuffer(frame, gradeB);

  if (mode === 'a-only') return { left: renderedA, right: renderedA };
  if (mode === 'b-only') return { left: renderedB, right: renderedB };
  if (mode === 'side-by-side') return { left: renderedA, right: renderedB };

  // split wipe
  const cut = Math.floor(frame.width * splitX);
  const left = new Uint8ClampedArray(frame.data.length);
  const right = new Uint8ClampedArray(frame.data.length);
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4;
      const src = x < cut ? renderedA : renderedB;
      left[i] = src.data[i];
      left[i + 1] = src.data[i + 1];
      left[i + 2] = src.data[i + 2];
      left[i + 3] = 255;
      right[i] = src.data[i];
      right[i + 1] = src.data[i + 1];
      right[i + 2] = src.data[i + 2];
      right[i + 3] = 255;
    }
  }
  return {
    left: { width: frame.width, height: frame.height, data: left },
    right: { width: frame.width, height: frame.height, data: right },
  };
}
