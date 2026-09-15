export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface ColorGradeSettings {
  lift: RGBColor;   // Shadows (-1.0 to 1.0)
  gamma: RGBColor;  // Midtones (0.1 to 2.0)
  gain: RGBColor;   // Highlights (0.0 to 4.0)
  offset: RGBColor; // Global Offset
  lutFilePath?: string;
  lutIntensity?: number;
}

export class ColorGradingEngine {
  /**
   * Generates WebGPU WGSL fragment shader code for 32-bit Float 3-Way Color Wheels & 3D LUT Evaluation
   */
  getWGSLShaderCode(_settings: ColorGradeSettings): string {
    return /* wgsl */ `
      struct ColorGradeUniforms {
        lift: vec3<f32>,
        gamma: vec3<f32>,
        gain: vec3<f32>,
        offset: vec3<f32>,
        lutIntensity: f32,
      };

      @group(0) @binding(0) var u_color: ColorGradeUniforms;

      fn apply3WayColorGrade(inColor: vec3<f32>) -> vec3<f32> {
        // Lift (Shadows adjustment)
        var col = max(vec3<f32>(0.0), inColor + u_color.lift);
        // Gamma (Midtones power curve)
        col = pow(col, 1.0 / u_color.gamma);
        // Gain (Highlights multiplier)
        col = col * u_color.gain + u_color.offset;
        return col;
      }
    `;
  }
}

export const colorEngine = new ColorGradingEngine();
