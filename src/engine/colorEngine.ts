import colorWgsl from './shaders/color.wgsl?raw';
import { applyCurvesToRgb, RGBCurves } from './colorCurves';
import { applySecondaryGrade, HSLSecondarySelection, SecondaryGrade } from './hslSecondary';
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorGradeSettings {
  lift: RGBColor;       // Shadows (-1.0 to 1.0)
  gamma: RGBColor;      // Midtones (0.1 to 2.0)
  gain: RGBColor;       // Highlights (0.0 to 4.0)
  offset: RGBColor;     // Global Offset (-1.0 to 1.0)
  saturation?: number;  // Saturation (0.0 to 2.0, default 1.0)
  contrast?: number;    // Contrast (0.0 to 2.0, default 1.0)
  temperature?: number; // Color Temperature (-1.0 to 1.0, default 0.0)
  tint?: number;        // Color Tint (-1.0 to 1.0, default 0.0)
  lutFilePath?: string;
  lutIntensity?: number;// 0.0 to 1.0
  lutData?: CubeLUTData;
  /** R24.2: 1D tone curves, applied after gamma. Absent = no-op. */
  curves?: RGBCurves;
  /** R24.2: HSL secondary qualifier + isolated grade, applied after curves. */
  secondarySelection?: HSLSecondarySelection;
  secondaryGrade?: SecondaryGrade;
}

export interface CubeLUTData {
  title: string;
  size: number; // e.g. 33 for 33x33x33 LUT
  data: Float32Array; // RGB float values in [0, 1] range
}

export class ColorGradingEngine {
  /**
   * Parses standard 3D .cube LUT file content into Float32Array buffer
   */
  parseCubeLUT(cubeContent: string): CubeLUTData {
    const lines = cubeContent.split(/\r?\n/);
    let title = 'Custom LUT';
    let size = 33;
    const values: number[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('TITLE')) {
        const match = line.match(/TITLE\s+"?([^"]+)"?/i);
        if (match) title = match[1];
        continue;
      }

      if (line.startsWith('LUT_3D_SIZE')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          size = parseInt(parts[1], 10);
        }
        continue;
      }

      // Parse 3 floating point numbers per RGB entry
      const rgbParts = line.split(/\s+/);
      if (rgbParts.length === 3) {
        const r = parseFloat(rgbParts[0]);
        const g = parseFloat(rgbParts[1]);
        const b = parseFloat(rgbParts[2]);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          values.push(r, g, b);
        }
      }
    }

    const expectedEntries = size * size * size * 3;
    const floatArray = new Float32Array(size * size * size * 4);
    for (let i = 0, j = 0; i < Math.min(values.length, expectedEntries); i += 3, j += 4) {
      floatArray[j] = values[i];
      floatArray[j+1] = values[i+1];
      floatArray[j+2] = values[i+2];
      floatArray[j+3] = 1.0;
    }

    return {
      title,
      size,
      data: floatArray,
    };
  }

  /**
   * Generates WebGPU WGSL fragment shader code for 32-bit Float 3-Way Color Wheels & 3D LUT Evaluation
   *
   * R24.2/R24.1 GPU parity: `color.wgsl` implements curves (baked 64-entry
   * 1D LUT uniform), the HSL secondary qualifier, and whole-grade mask
   * gating alongside lift/gamma/gain/LUT. `evaluateColorOnCPU` is the
   * conformance oracle for all three stages.
   */
  getWGSLShaderCode(_settings?: ColorGradeSettings): string {
    return colorWgsl;
  }

  /**
   * CPU-based floating point color grading evaluation (for unit tests / WebGL / Software render fallback)
   */
  evaluateColorOnCPU(inputRgb: RGBColor, settings: ColorGradeSettings): RGBColor {
    let r = inputRgb.r + (settings.temperature ?? 0) * 0.1;
    let g = inputRgb.g - (settings.tint ?? 0) * 0.1;
    let b = inputRgb.b - (settings.temperature ?? 0) * 0.1;

    // Lift
    r = Math.max(0, r + settings.lift.r);
    g = Math.max(0, g + settings.lift.g);
    b = Math.max(0, b + settings.lift.b);

    // Gamma
    r = Math.pow(r, 1.0 / Math.max(0.01, settings.gamma.r));
    g = Math.pow(g, 1.0 / Math.max(0.01, settings.gamma.g));
    b = Math.pow(b, 1.0 / Math.max(0.01, settings.gamma.b));

    // R24.2 Curves (master, then per-channel). Absent = identity.
    if (settings.curves) {
      const curved = applyCurvesToRgb({ r, g, b }, settings.curves);
      r = curved.r;
      g = curved.g;
      b = curved.b;
    }

    // R24.2 HSL secondary (isolated lift/gain by qualifier weight).
    if (settings.secondarySelection && settings.secondaryGrade) {
      const seconded = applySecondaryGrade({ r, g, b }, settings.secondarySelection, settings.secondaryGrade);
      r = seconded.r;
      g = seconded.g;
      b = seconded.b;
    }

    // Gain & Offset
    r = r * settings.gain.r + settings.offset.r;
    g = g * settings.gain.g + settings.offset.g;
    b = b * settings.gain.b + settings.offset.b;

    // Contrast
    const contrast = settings.contrast ?? 1.0;
    r = (r - 0.5) * contrast + 0.5;
    g = (g - 0.5) * contrast + 0.5;
    b = (b - 0.5) * contrast + 0.5;

    // Saturation
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = settings.saturation ?? 1.0;
    r = luma + sat * (r - luma);
    g = luma + sat * (g - luma);
    b = luma + sat * (b - luma);

    return {
      r: Math.min(1.0, Math.max(0.0, r)),
      g: Math.min(1.0, Math.max(0.0, g)),
      b: Math.min(1.0, Math.max(0.0, b)),
    };
  }
}

export const colorEngine = new ColorGradingEngine();
