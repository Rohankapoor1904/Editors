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
    const floatArray = new Float32Array(expectedEntries);
    for (let i = 0; i < Math.min(values.length, expectedEntries); i++) {
      floatArray[i] = values[i];
    }

    return {
      title,
      size,
      data: floatArray,
    };
  }

  /**
   * Generates WebGPU WGSL fragment shader code for 32-bit Float 3-Way Color Wheels & 3D LUT Evaluation
   */
  getWGSLShaderCode(settings: ColorGradeSettings): string {
    const hasLut = (settings.lutIntensity ?? 0) > 0;

    return /* wgsl */ `
      struct ColorGradeUniforms {
        lift: vec3<f32>,
        gamma: vec3<f32>,
        gain: vec3<f32>,
        offset: vec3<f32>,
        params: vec4<f32>, // x: saturation, y: contrast, z: temperature, w: tint
        lutParams: vec2<f32>, // x: lutSize, y: lutIntensity
      };

      @group(0) @binding(0) var u_color: ColorGradeUniforms;
      ${hasLut ? `@group(0) @binding(1) var u_lutTexture: texture_3d<f32>;
      @group(0) @binding(2) var u_lutSampler: sampler;` : ''}

      fn apply3WayColorGrade(inColor: vec3<f32>) -> vec3<f32> {
        // 1. Temperature & Tint Adjustment
        var col = inColor + vec3<f32>(u_color.params.z * 0.1, 0.0, -u_color.params.z * 0.1);
        col += vec3<f32>(u_color.params.w * 0.05, -u_color.params.w * 0.1, u_color.params.w * 0.05);

        // 2. Lift (Shadows adjustment)
        col = max(vec3<f32>(0.0), col + u_color.lift);

        // 3. Gamma (Midtones power curve)
        let safeGamma = max(vec3<f32>(0.01), u_color.gamma);
        col = pow(col, 1.0 / safeGamma);

        // 4. Gain & Offset (Highlights multiplier & global offset)
        col = col * u_color.gain + u_color.offset;

        // 5. Contrast Adjustment
        let contrast = u_color.params.y;
        col = (col - vec3<f32>(0.5)) * contrast + vec3<f32>(0.5);

        // 6. Saturation Adjustment
        let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
        let sat = u_color.params.x;
        col = mix(vec3<f32>(luma), col, sat);

        // 7. 3D LUT Trilinear Evaluation
        ${hasLut ? `
        if (u_color.lutParams.y > 0.0) {
          let lutCoord = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
          let lutColor = textureSampleLevel(u_lutTexture, u_lutSampler, lutCoord, 0.0).rgb;
          col = mix(col, lutColor, u_color.lutParams.y);
        }
        ` : ''}

        return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
      }
    `;
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
