import { describe, it, expect } from 'vitest';
import {
  OcioConfig,
  acesFilmicToneMap,
  hdrReport,
} from './colorManagement';

describe('R26.3 — working-space round-trips', () => {
  it('returns each space round-trip within the established tolerance', () => {
    const ocio = new OcioConfig();
    // 1e-4 matches the pre-existing suite (EOTF/OETF + matrix chains).
    const tolerance = 1e-4;
    for (const space of ['sRGB', 'Rec.709', 'ACEScg', 'ACES2065-1']) {
      const rgb: [number, number, number] = [0.4, 0.25, 0.7];
      const out = ocio.convert(ocio.convert(rgb, space, 'ACEScg'), 'ACEScg', space);
      expect(Math.abs(out[0] - rgb[0])).toBeLessThan(tolerance);
      expect(Math.abs(out[1] - rgb[1])).toBeLessThan(tolerance);
      expect(Math.abs(out[2] - rgb[2])).toBeLessThan(tolerance);
    }
    expect(() => ocio.convert([0.5, 0.5, 0.5], 'sRGB', 'Nope')).toThrow();
  });
});

describe('R26.3 — display tone-map approximation', () => {
  it('is monotonic, anchored and labelled (not an RRT)', () => {
    expect(acesFilmicToneMap(0)).toBe(0);
    expect(acesFilmicToneMap(100)).toBeLessThanOrEqual(1);
    const a = acesFilmicToneMap(0.2);
    const b = acesFilmicToneMap(0.8);
    expect(b).toBeGreaterThan(a);
    expect(() => acesFilmicToneMap(NaN)).toThrow();
  });
});

describe('R26.3 acceptance — HDR report lists MaxFALL/MaxCLL', () => {
  it('measures peak and frame-average luminance exactly', () => {
    const w = 4;
    const h = 2;
    // Seven dim pixels at 100 nits, one 4000-nit highlight.
    const frame = new Float32Array([100, 100, 100, 100, 100, 100, 100, 4000]);
    const report = hdrReport([frame], w, h);
    expect(report.maxCLL).toBe(4000);
    expect(report.maxFALL).toBeCloseTo((100 * 7 + 4000) / 8, 9);
    expect(report.framesMeasured).toBe(1);

    const dimmer = new Float32Array(8).fill(50);
    const multi = hdrReport([dimmer, frame], w, h);
    expect(multi.maxCLL).toBe(4000);
    expect(multi.maxFALL).toBeCloseTo((100 * 7 + 4000) / 8, 9);
    expect(multi.framesMeasured).toBe(2);
  });

  it('refuses empty and invalid HDR input', () => {
    expect(() => hdrReport([], 4, 2)).toThrow();
    expect(() => hdrReport([new Float32Array(8).fill(-5)], 4, 2)).toThrow();
    expect(() => hdrReport([new Float32Array(4)], 4, 2)).toThrow();
  });
});
