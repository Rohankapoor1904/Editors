import { describe, it, expect } from 'vitest';
import { resolveActiveAdjustments, applyAdjustments } from './adjustmentLayers';
import { colorEngine, ColorGradeSettings } from './colorEngine';
import { Clip } from '../types/timeline';
import { createRational } from '../types/time';

const GRADE: ColorGradeSettings = {
  lift: { r: 0.1, g: 0, b: 0 },
  gamma: { r: 1, g: 1, b: 1 },
  gain: { r: 1, g: 1, b: 1 },
  offset: { r: 0, g: 0, b: 0 },
};

function adjustmentClip(id: string, start: number, dur: number): Clip {
  return {
    id,
    assetId: `adjustment://${id}`,
    name: 'Adjustment Layer',
    startOffset: createRational(start, 1),
    sourceIn: createRational(0, 1),
    sourceOut: createRational(dur, 1),
    duration: createRational(dur, 1),
    adjustment: true,
    effects: [{ id: `${id}-grade`, type: 'colorGrade', enabled: true, params: GRADE as unknown as Record<string, unknown> }],
  };
}

describe('R26.1 — adjustment resolution', () => {
  it('finds spanning adjustments and ignores the rest', () => {
    const clips = [
      adjustmentClip('adj1', 2, 6),
      { ...adjustmentClip('adj2', 20, 4), effects: [] },
    ];
    expect(resolveActiveAdjustments(clips, 4).map((a) => a.clipId)).toEqual(['adj1']);
    expect(resolveActiveAdjustments(clips, 0)).toEqual([]);
    expect(resolveActiveAdjustments(clips, 8)).toEqual([]);
    expect(() => resolveActiveAdjustments(clips, -1)).toThrow();
  });
});

describe('R26.1 acceptance — adjustment grade equals per-clip grade', () => {
  it('composes identically to direct grading', () => {
    const pixel = { r: 0.4, g: 0.3, b: 0.2 };
    const direct = colorEngine.evaluateColorOnCPU(pixel, GRADE);
    const viaLayer = applyAdjustments(pixel, [{ clipId: 'adj1', grade: GRADE }]);
    expect(viaLayer).toEqual(direct);
    expect(applyAdjustments(pixel, [])).toEqual(pixel);
  });
});
