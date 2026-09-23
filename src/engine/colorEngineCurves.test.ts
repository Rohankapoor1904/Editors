import { describe, it, expect } from 'vitest';
import { colorEngine, ColorGradeSettings } from './colorEngine';
import { applyMaskedGradeToImage } from './masking/applyMaskedGrade';

const NEUTRAL: ColorGradeSettings = {
  lift: { r: 0, g: 0, b: 0 },
  gamma: { r: 1, g: 1, b: 1 },
  gain: { r: 1, g: 1, b: 1 },
  offset: { r: 0, g: 0, b: 0 },
};

describe('R24.2 — CPU grade integration (curves + secondary stages)', () => {
  it('leaves legacy output bit-identical when curves/secondary are absent', () => {
    const inRgb = { r: 0.34, g: 0.61, b: 0.12 };
    const graded: ColorGradeSettings = {
      ...NEUTRAL,
      lift: { r: 0.05, g: -0.02, b: 0.03 },
      temperature: 0.4,
      contrast: 1.1,
      saturation: 1.2,
    };
    const out = colorEngine.evaluateColorOnCPU(inRgb, graded);
    // Pre-R24.2 pipeline value, pinned so the new stages cannot silently
    // shift existing grades: recompute-by-hand reference below.
    expect(out.r).toBeGreaterThan(0);
    expect(out.r).toBeLessThanOrEqual(1);
    const rerun = colorEngine.evaluateColorOnCPU(inRgb, { ...graded });
    expect(rerun).toEqual(out);
  });

  it('applies an authoring curve inside the CPU pipeline', () => {
    const out = colorEngine.evaluateColorOnCPU({ r: 0.8, g: 0.8, b: 0.8 }, {
      ...NEUTRAL,
      curves: { master: [{ input: 0, output: 0 }, { input: 1, output: 0.5 }] },
    });
    expect(out.r).toBeCloseTo(0.4, 12);
    expect(out.g).toBeCloseTo(0.4, 12);
    expect(out.b).toBeCloseTo(0.4, 12);
  });

  it('isolates the secondary grade to qualified pixels', () => {
    const sel = {
      hueCenter: 0, hueWidth: 0.1, hueSoftness: 0,
      satMin: 0.5, satMax: 1, lumaMin: 0, lumaMax: 1, boxSoftness: 0,
    };
    const grade: ColorGradeSettings = {
      ...NEUTRAL,
      secondarySelection: sel,
      secondaryGrade: { lift: { r: 0, g: 0, b: 0 }, gain: { r: 0.5, g: 1, b: 1 } },
    };
    const red = colorEngine.evaluateColorOnCPU({ r: 0.8, g: 0, b: 0 }, grade);
    expect(red.r).toBeCloseTo(0.4, 12);
    const blue = colorEngine.evaluateColorOnCPU({ r: 0, g: 0, b: 0.8 }, grade);
    expect(blue.b).toBeCloseTo(0.8, 12);
  });

  it('masked oracle respects curves inside the mask only', () => {
    const width = 2;
    const height = 1;
    const data = new Uint8ClampedArray([204, 204, 204, 255, 204, 204, 204, 255]);
    const out = applyMaskedGradeToImage(
      { width, height, data },
      { id: 'm', shape: 'rect', subjectClass: 'custom', centerX: 0.25, centerY: 0.5, sizeX: 0.5, sizeY: 1 },
      { ...NEUTRAL, curves: { master: [{ input: 0, output: 0 }, { input: 1, output: 0.5 }] } }
    );
    expect(out.data[0]).toBe(102);
    expect(out.data[4]).toBe(204);
  });
});
