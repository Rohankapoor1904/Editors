/**
 * Partial OpenColorIO-style configuration and transformations.
 * This is a partial subset as per R4.3 acceptance criteria.
 */

export interface ColorSpace {
    name: string;
    family: string;
    toReference: (rgb: [number, number, number]) => [number, number, number];
    fromReference: (rgb: [number, number, number]) => [number, number, number];
}

// Matrices from SMPTE RP 431-2, ACES standard, and sRGB spec.

function multiplyMatrix(m: number[], v: [number, number, number]): [number, number, number] {
    return [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
}

// Standard sRGB OETF and EOTF
const srgbEotf = (v: number) => {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const srgbOetf = (v: number) => {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
};

// Assuming the reference space is linear sRGB (Linear Rec.709) for simplicity of this subset.

export const sRGBSpace: ColorSpace = {
    name: 'sRGB',
    family: 'Display',
    toReference: (rgb: [number, number, number]) => {
        return [srgbEotf(rgb[0]), srgbEotf(rgb[1]), srgbEotf(rgb[2])];
    },
    fromReference: (rgb: [number, number, number]) => {
        return [srgbOetf(rgb[0]), srgbOetf(rgb[1]), srgbOetf(rgb[2])];
    }
};

// ACEScg to Linear sRGB conversion matrix
// https://github.com/ampas/aces-dev/blob/master/transforms/ctl/acescg/ACEScsc.ACEScg_to_ACES.ctl
// It is simpler to use the direct conversion matrix between sRGB linear and ACEScg.
// ACEScg to sRGB linear:
const ACEScg_to_sRGB = [
    1.70505295, -0.62186715, -0.0831858,
    -0.13025595, 1.14080184, -0.0105459,
    -0.02400713, -0.1289657, 1.15297284
];

// sRGB linear to ACEScg:
const sRGB_to_ACEScg = [
    0.6130974, 0.339523, 0.0473796,
    0.070194, 0.9163539, 0.0134521,
    0.020619, 0.1095697, 0.8698113
];

export const ACEScgSpace: ColorSpace = {
    name: 'ACEScg',
    family: 'ACES',
    // Reference is linear sRGB, so from ACEScg to Reference:
    toReference: (rgb: [number, number, number]) => {
        return multiplyMatrix(ACEScg_to_sRGB, rgb);
    },
    // Reference to ACEScg:
    fromReference: (rgb: [number, number, number]) => {
        return multiplyMatrix(sRGB_to_ACEScg, rgb);
    }
};

// R26.3 — Rec.709 scene-linear (same primaries as sRGB; transfer handled
// by the sRGB pair above for display-referred work, documented). Kept as a
// distinct space so projects tag broadcast correctly.
export const Rec709Space: ColorSpace = {
    name: 'Rec.709',
    family: 'Broadcast',
    toReference: (rgb: [number, number, number]) => {
        return [srgbEotf(rgb[0]), srgbEotf(rgb[1]), srgbEotf(rgb[2])];
    },
    fromReference: (rgb: [number, number, number]) => {
        return [srgbOetf(rgb[0]), srgbOetf(rgb[1]), srgbOetf(rgb[2])];
    }
};

// R26.3 — ACES2065-1 (AP0) via the AP1 staging space (SMPTE ST 2065-1).
// Only ONE direction is a published literal; the return matrix is derived
// at runtime by exact inversion so round-trips hold to float precision
// (two independently-rounded literals would not be exact inverses).
const AP0_to_AP1 = [
    0.6954522414, 0.1406786965, 0.1638690621,
    0.0447945634, 0.8596711185, 0.0955343181,
    -0.0055258826, 0.0040252103, 1.0015006722
];

function invertMatrix3(m: number[]): number[] {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h;
    const B = -(d * i - f * g);
    const C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (det === 0 || !Number.isFinite(det)) {
        throw new Error('colorManagement: singular matrix cannot be inverted');
    }
    return [
        A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
        B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
        C / det, -(a * h - b * g) / det, (a * e - b * d) / det,
    ];
}

const AP1_to_AP0 = invertMatrix3(AP0_to_AP1);

export const ACES2065Space: ColorSpace = {
    name: 'ACES2065-1',
    family: 'ACES',
    // Reference is linear sRGB: AP0 -> AP1 -> linear sRGB.
    toReference: (rgb: [number, number, number]) => {
        return multiplyMatrix(ACEScg_to_sRGB, multiplyMatrix(AP0_to_AP1, rgb));
    },
    // linear sRGB -> AP1 -> AP0.
    fromReference: (rgb: [number, number, number]) => {
        return multiplyMatrix(AP1_to_AP0, multiplyMatrix(sRGB_to_ACEScg, rgb));
    }
};

export class OcioConfig {
    private spaces: Map<string, ColorSpace> = new Map();
    private workingSpaceName: string = '';
    private displaySpaceName: string = '';

    constructor() {
        this.registerSpace(sRGBSpace);
        this.registerSpace(ACEScgSpace);
        this.registerSpace(Rec709Space);
        this.registerSpace(ACES2065Space);
    }

    public registerSpace(space: ColorSpace) {
        this.spaces.set(space.name, space);
    }

    public getSpace(name: string): ColorSpace {
        const space = this.spaces.get(name);
        if (!space) {
            throw new Error(`Color space ${name} not found`);
        }
        return space;
    }

    public setWorkingSpace(name: string) {
        if (!this.spaces.has(name)) {
            throw new Error(`Color space ${name} not found`);
        }
        this.workingSpaceName = name;
    }

    public setDisplaySpace(name: string) {
        if (!this.spaces.has(name)) {
            throw new Error(`Color space ${name} not found`);
        }
        this.displaySpaceName = name;
    }

    public getWorkingSpace(): string {
        return this.workingSpaceName;
    }

    public getDisplaySpace(): string {
        return this.displaySpaceName;
    }

    public convert(rgb: [number, number, number], fromSpace: string, toSpace: string): [number, number, number] {
        const from = this.getSpace(fromSpace);
        const to = this.getSpace(toSpace);

        if (fromSpace === toSpace) return rgb;

        // Convert to reference (Linear sRGB)
        const reference = from.toReference(rgb);

        // Convert from reference to target space
        return to.fromReference(reference);
    }
}

/**
 * R26.3 — Narkowicz-style ACES filmic approximation for display preview.
 * This is a CURVE FIT, not the ACES RRT+ODT: it is monotonic, maps 0 to 0
 * and compresses highlights, which is all a preview needs. It must never
 * be presented as a standards transform (no RRT/ODT here).
 */
export function acesFilmicToneMap(x: number): number {
  if (!Number.isFinite(x)) throw new Error('colorManagement: tone-map input must be finite');
  const v = Math.max(0, x) * 0.6;
  return Math.min(1, Math.max(0, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)));
}

export interface HdrReport {
  /** Maximum content light level: brightest sample, nits. */
  maxCLL: number;
  /** Maximum frame-average light level over the supplied frames, nits. */
  maxFALL: number;
  framesMeasured: number;
}

/**
 * R26.3 — CTA-861.3 MaxCLL/MaxFALL over caller-supplied linear HDR
 * luminance (nits). Single-frame input reports that frame's average as
 * FALL. Throws on empty/non-finite input rather than reporting zeros.
 */
export function hdrReport(frames: Float32Array[], width: number, height: number): HdrReport {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('colorManagement: HDR report needs at least one luminance frame');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('colorManagement: HDR report needs positive integer dimensions');
  }
  let maxCLL = 0;
  let maxFALL = 0;
  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    if (!(frame instanceof Float32Array) || frame.length !== width * height) {
      throw new Error(`colorManagement: HDR frame ${f} dimensions do not match width*height`);
    }
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      const v = frame[i];
      if (!Number.isFinite(v) || v < 0) {
        throw new Error(`colorManagement: HDR frame ${f} holds invalid luminance`);
      }
      if (v > peak) peak = v;
      sum += v;
    }
    if (peak > maxCLL) maxCLL = peak;
    const fall = sum / frame.length;
    if (fall > maxFALL) maxFALL = fall;
  }
  return { maxCLL, maxFALL, framesMeasured: frames.length };
}
