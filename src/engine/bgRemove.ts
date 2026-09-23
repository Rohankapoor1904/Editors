/**
 * R25.5 — background-matte engine (CPU oracles + compositing).
 *
 * One-tap removal without a green screen ultimately needs a segmentation
 * model this build does not bundle (see neuralSegment(): it throws
 * honestly). What ships is real and testable today: chroma-key matting
 * mirroring the GPU chroma_key stage, static-camera difference matting,
 * matte cleanup (despeckle + feather), and Porter-Duff compositing onto
 * caller-supplied backgrounds. These oracles pin the math the GPU/DAG
 * path must reproduce when it consumes `bg_remove` effect entries.
 */

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

function checkImage(image: RgbaImage, label: string): void {
  if (!image || !Number.isInteger(image.width) || image.width <= 0) {
    throw new Error(`bgRemove: ${label} has invalid width`);
  }
  if (!Number.isInteger(image.height) || image.height <= 0) {
    throw new Error(`bgRemove: ${label} has invalid height`);
  }
  if (!(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) {
    throw new Error(`bgRemove: ${label} data must be RGBA with length width*height*4`);
  }
}

function checkPair(a: RgbaImage, b: RgbaImage): void {
  checkImage(a, 'foreground');
  checkImage(b, 'background');
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error('bgRemove: foreground and background dimensions must match');
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface ChromaKeyParams {
  keyColor: RGB;
  /** 0..1 distance below which pixels are fully keyed. */
  similarity: number;
  /** 0..1 soft band above similarity. */
  smoothness: number;
}

/**
 * R25.5 — chroma matte: normalized-RGB distance to the key color maps to
 * transparency (1 = keep, 0 = remove). Green despill is deferred to the
 * GPU chroma_key stage (which owns a spill uniform); this oracle pins
 * alpha only. Returns per-pixel alpha 0..1.
 */
export function chromaMatte(image: RgbaImage, params: ChromaKeyParams): Float32Array {
  checkImage(image, 'chroma input');
  const { keyColor, similarity, smoothness } = params;
  for (const [name, v] of [['similarity', similarity], ['smoothness', smoothness]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`bgRemove: chroma ${name} must be within [0,1]`);
    }
  }
  const n = image.width * image.height;
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = image.data[i * 4] / 255;
    const g = image.data[i * 4 + 1] / 255;
    const b = image.data[i * 4 + 2] / 255;
    const dist = Math.sqrt((r - keyColor.r) ** 2 + (g - keyColor.g) ** 2 + (b - keyColor.b) ** 2) / Math.sqrt(3);
    // Near the key color -> transparent (0); far -> opaque (1).
    alpha[i] = smoothstep(similarity, similarity + smoothness, dist);
  }
  return alpha;
}

export interface DifferenceParams {
  /** 0..1 per-pixel distance above which pixels are foreground. */
  threshold: number;
  /** 0..1 soft band above threshold. */
  softness?: number;
}

/**
 * R25.5 — static-camera difference matte: pixels far from the learned
 * background plate become foreground. Pure per-pixel RGB distance.
 */
export function differenceMatte(frame: RgbaImage, background: RgbaImage, params: DifferenceParams): Float32Array {
  checkPair(frame, background);
  const { threshold } = params;
  const softness = params.softness ?? 0;
  for (const [name, v] of [['threshold', threshold], ['softness', softness]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      throw new Error(`bgRemove: difference ${name} must be within [0,1]`);
    }
  }
  const n = frame.width * frame.height;
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dr = frame.data[i * 4] / 255 - background.data[i * 4] / 255;
    const dg = frame.data[i * 4 + 1] / 255 - background.data[i * 4 + 1] / 255;
    const db = frame.data[i * 4 + 2] / 255 - background.data[i * 4 + 2] / 255;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db) / Math.sqrt(3);
    alpha[i] = smoothstep(threshold, threshold + softness, dist);
  }
  return alpha;
}

export interface RefineParams {
  /** Majority despeckle passes (0 disables). */
  despecklePasses?: number;
  /** Box-blur feather radius in px (0 disables). */
  featherRadius?: number;
}

/**
 * R25.5 — matte cleanup: majority-vote despeckle kills isolated specks,
 * then a box blur softens edges. Solid regions survive bit-exactly when
 * both stages are off; refinement never invents foreground.
 */
export function refineMatte(
  alpha: Float32Array,
  width: number,
  height: number,
  params: RefineParams = {}
): Float32Array {
  if (!(alpha instanceof Float32Array) || alpha.length !== width * height) {
    throw new Error('bgRemove: matte dimensions do not match width*height');
  }
  const passes = params.despecklePasses ?? 0;
  const radius = params.featherRadius ?? 0;
  if (!Number.isInteger(passes) || passes < 0) throw new Error('bgRemove: despecklePasses must be a non-negative integer');
  if (!Number.isInteger(radius) || radius < 0) throw new Error('bgRemove: featherRadius must be a non-negative integer');

  let current = Float32Array.from(alpha);
  const at = (buf: Float32Array, x: number, y: number): number => {
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return buf[cy * width + cx];
  };
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let votes = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            if (at(current, x + ox, y + oy) > 0.5) votes++;
          }
        }
        next[y * width + x] = votes >= 5 ? 1 : 0;
      }
    }
    current = next;
  }
  if (radius > 0) {
    const blurred = new Float32Array(current.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let oy = -radius; oy <= radius; oy++) {
          for (let ox = -radius; ox <= radius; ox++) {
            sum += at(current, x + ox, y + oy);
            count++;
          }
        }
        blurred[y * width + x] = sum / count;
      }
    }
    current = blurred;
  }
  return current;
}

/**
 * R25.5 — Porter-Duff over: foreground matted onto a caller-supplied
 * background. Removing the matte path (alpha all ones) reproduces the
 * input bit-exactly (pinned by test: disable restores the frame).
 */
export function compositeOver(foreground: RgbaImage, matte: Float32Array, background: RgbaImage): RgbaImage {
  checkPair(foreground, background);
  if (!(matte instanceof Float32Array) || matte.length !== foreground.width * foreground.height) {
    throw new Error('bgRemove: matte dimensions do not match the frame');
  }
  const out = new Uint8ClampedArray(foreground.data.length);
  for (let i = 0; i < matte.length; i++) {
    const a = Math.min(1, Math.max(0, matte[i]));
    out[i * 4] = Math.round(foreground.data[i * 4] * a + background.data[i * 4] * (1 - a));
    out[i * 4 + 1] = Math.round(foreground.data[i * 4 + 1] * a + background.data[i * 4 + 1] * (1 - a));
    out[i * 4 + 2] = Math.round(foreground.data[i * 4 + 2] * a + background.data[i * 4 + 2] * (1 - a));
    out[i * 4 + 3] = 255;
  }
  return { width: foreground.width, height: foreground.height, data: out };
}

/**
 * R25.5 — neural subject segmentation entry point. No segmentation model
 * is bundled with this build, so this throws in every mode rather than
 * returning a box, a 1×1 mask, or a sine-wave trajectory (the exact
 * fabrication this repo's GAP_ANALYSIS documents).
 */
export function neuralSegment(): never {
  throw new Error(
    'bgRemove: neural segmentation unavailable (no model bundled). Use chroma or difference matting instead.'
  );
}
