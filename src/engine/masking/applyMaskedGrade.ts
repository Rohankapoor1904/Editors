import { ClipMask } from '../../types/timeline';
import { ColorGradeSettings } from '../colorEngine';
import { colorEngine } from '../colorEngine';
import { maskAlphaAt } from './maskTypes';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * R24.1 — CPU reference for masked grading: applies the real 3-way grade
 * (via ColorGradingEngine.evaluateColorOnCPU) blended by mask alpha, so a
 * behavioural test can prove "the grade lands inside the mask only".
 * Non-destructive: the input buffer is never mutated; a new image is
 * returned. This is the conformance oracle for the future GPU uniform
 * plumbing, not a replacement for it.
 */
export function applyMaskedGradeToImage(
  image: RgbaImage,
  mask: ClipMask,
  settings: ColorGradeSettings
): RgbaImage {
  if (!image || !Number.isInteger(image.width) || image.width <= 0) {
    throw new Error('applyMaskedGradeToImage: image has invalid width');
  }
  if (!Number.isInteger(image.height) || image.height <= 0) {
    throw new Error('applyMaskedGradeToImage: image has invalid height');
  }
  if (!(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) {
    throw new Error('applyMaskedGradeToImage: data must be RGBA with length width*height*4');
  }

  const out = new Uint8ClampedArray(image.data.length);
  for (let py = 0; py < image.height; py++) {
    for (let px = 0; px < image.width; px++) {
      const i = (py * image.width + px) * 4;
      const nx = (px + 0.5) / image.width;
      const ny = (py + 0.5) / image.height;
      const alpha = maskAlphaAt(mask, nx, ny);
      if (alpha <= 0) {
        out[i] = image.data[i];
        out[i + 1] = image.data[i + 1];
        out[i + 2] = image.data[i + 2];
        out[i + 3] = image.data[i + 3];
        continue;
      }
      const graded = colorEngine.evaluateColorOnCPU(
        {
          r: image.data[i] / 255,
          g: image.data[i + 1] / 255,
          b: image.data[i + 2] / 255,
        },
        settings
      );
      out[i] = Math.round(image.data[i] * (1 - alpha) + graded.r * 255 * alpha);
      out[i + 1] = Math.round(image.data[i + 1] * (1 - alpha) + graded.g * 255 * alpha);
      out[i + 2] = Math.round(image.data[i + 2] * (1 - alpha) + graded.b * 255 * alpha);
      out[i + 3] = image.data[i + 3];
    }
  }
  return { width: image.width, height: image.height, data: out };
}
