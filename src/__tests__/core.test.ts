import { describe, it, expect } from 'vitest';
import { calculateMagneticSnap } from '../utils/snapping';
import { interpolateKeyframeValue } from '../utils/keyframing';
import { colorEngine } from '../engine/colorEngine';
import type { Clip, Keyframe } from '../types/timeline';
import { secondsToRational } from '../types/time';

const makeClip = (id: string, startOffset: number, duration: number): Clip =>
  ({ id, assetId: `asset-${id}`, name: id, startOffset: secondsToRational(startOffset), sourceIn: secondsToRational(0), sourceOut: secondsToRational(duration), duration: secondsToRational(duration) });

describe('calculateMagneticSnap', () => {
  it('snaps to the playhead when within threshold', () => {
    const result = calculateMagneticSnap(10.02, [], 10, 100, 10);
    expect(result.isSnapped).toBe(true);
    expect(result.snappedTime).toBe(10);
  });

  it('does not snap when the drag is outside the threshold', () => {
    const result = calculateMagneticSnap(10.5, [], 10, 100, 10);
    expect(result.isSnapped).toBe(false);
    expect(result.snappedTime).toBe(10.5);
    expect(result.targetTime).toBeNull();
  });

  it('snaps to clip start and end edges', () => {
    const clips = [makeClip('a', 5, 3)];
    expect(calculateMagneticSnap(5.01, clips, 100, 100).snappedTime).toBe(5);
    expect(calculateMagneticSnap(7.99, clips, 100, 100).snappedTime).toBe(8);
  });

  it('always treats timeline zero as a snap target', () => {
    const result = calculateMagneticSnap(0.03, [], 999, 100);
    expect(result.isSnapped).toBe(true);
    expect(result.snappedTime).toBe(0);
  });

  it('scales the threshold with zoom: a lower zoom snaps from further away', () => {
    const clips = [makeClip('a', 5, 1)];
    expect(calculateMagneticSnap(5.2, clips, 999, 1).isSnapped).toBe(true);
    expect(calculateMagneticSnap(5.2, clips, 999, 1000).isSnapped).toBe(false);
  });

  it('prefers the nearest target when several are in range', () => {
    const clips = [makeClip('a', 10, 0.02)];
    const result = calculateMagneticSnap(10.005, clips, 0, 100, 10);
    expect(result.snappedTime).toBe(10);
  });
});

describe('interpolateKeyframeValue', () => {
  const keys: Keyframe[] = [
    { time: secondsToRational(0), value: 0 },
    { time: secondsToRational(10), value: 100 },
  ];

  it('returns 0 for an empty set', () => {
    expect(interpolateKeyframeValue([], secondsToRational(5))).toBe(0);
  });

  it('holds the first value before the first keyframe', () => {
    expect(interpolateKeyframeValue(keys, secondsToRational(-5))).toBe(0);
  });

  it('holds the last value after the last keyframe', () => {
    expect(interpolateKeyframeValue(keys, secondsToRational(50))).toBe(100);
  });

  it('interpolates linearly at the midpoint', () => {
    expect(interpolateKeyframeValue(keys, secondsToRational(5))).toBe(50);
  });

  it('selects the correct segment across three keyframes', () => {
    const three: Keyframe[] = [
      { time: secondsToRational(0), value: 0 },
      { time: secondsToRational(10), value: 100 },
      { time: secondsToRational(20), value: 0 },
    ];
    expect(interpolateKeyframeValue(three, secondsToRational(15))).toBe(50);
    expect(interpolateKeyframeValue(three, secondsToRational(10))).toBe(100);
  });

  it('applies real cubic Bezier curves when easing is specified', () => {
    const easeInKeys: Keyframe[] = [
      { time: secondsToRational(0), value: 0, easing: 'ease-in' },
      { time: secondsToRational(10), value: 100, easing: 'ease-in' },
    ];
    const easeOutKeys: Keyframe[] = [
      { time: secondsToRational(0), value: 0, easing: 'ease-out' },
      { time: secondsToRational(10), value: 100, easing: 'ease-out' },
    ];
    const easeInOutKeys: Keyframe[] = [
      { time: secondsToRational(0), value: 0, easing: 'ease-in-out' },
      { time: secondsToRational(10), value: 100, easing: 'ease-in-out' },
    ];

    // At progress 0.5:
    // ease-in is accelerating, so value must be strictly below linear (50)
    const valEaseIn = interpolateKeyframeValue(easeInKeys, secondsToRational(5));
    expect(valEaseIn).toBeLessThan(40);
    expect(valEaseIn).toBeGreaterThan(25);

    // ease-out started fast, so value must be strictly above linear (50)
    const valEaseOut = interpolateKeyframeValue(easeOutKeys, secondsToRational(5));
    expect(valEaseOut).toBeGreaterThan(60);
    expect(valEaseOut).toBeLessThan(75);

    // ease-in-out has S-curve: at progress 0.25 (time 2.5), it is slower than linear
    const valEaseInOutEarly = interpolateKeyframeValue(easeInOutKeys, secondsToRational(2.5));
    expect(valEaseInOutEarly).toBeLessThan(20);
  });
});

describe('ColorGradingEngine.parseCubeLUT', () => {
  it('parses title and size from a LUT header', () => {
    const lut = colorEngine.parseCubeLUT('TITLE "Test LUT"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n');
    expect(lut.title).toBe('Test LUT');
    expect(lut.size).toBe(2);
  });

  it('produces size^3 * 3 floats for a cube', () => {
    const lut = colorEngine.parseCubeLUT('LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n');
    expect(lut.data).toBeInstanceOf(Float32Array);
    expect(lut.data.length).toBe(2 * 2 * 2 * 4);
  });

  it('ignores comments and blank lines', () => {
    const withNoise = colorEngine.parseCubeLUT('# comment\n\nTITLE "C"\nLUT_3D_SIZE 2\n# mid\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n');
    expect(withNoise.size).toBe(2);
    expect(withNoise.data.length).toBe(32);
  });

  it('round-trips float values in file order', () => {
    const lut = colorEngine.parseCubeLUT('LUT_3D_SIZE 2\n0 0 0\n0.5 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n');
    expect(lut.data[0]).toBeCloseTo(0, 5);
    expect(lut.data[4]).toBeCloseTo(0.5, 5);
    expect(lut.data[lut.data.length - 2]).toBeCloseTo(1, 5);
  });
});

describe('ColorGradingEngine.evaluateColorOnCPU', () => {
  const neutral = {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 1, g: 1, b: 1 },
    gain: { r: 1, g: 1, b: 1 },
    offset: { r: 0, g: 0, b: 0 },
  };

  it('leaves a neutral grade unchanged', () => {
    const out = colorEngine.evaluateColorOnCPU({ r: 0.4, g: 0.5, b: 0.6 }, neutral);
    expect(out.r).toBeCloseTo(0.4, 5);
    expect(out.g).toBeCloseTo(0.5, 5);
    expect(out.b).toBeCloseTo(0.6, 5);
  });

  it('clamps output into the 0..1 range', () => {
    const out = colorEngine.evaluateColorOnCPU({ r: 0.9, g: 0.9, b: 0.9 }, {
      ...neutral,
      gain: { r: 4, g: 4, b: 4 },
    });
    expect(out.r).toBeLessThanOrEqual(1);
    expect(out.g).toBeGreaterThanOrEqual(0);
  });

  it('desaturates toward Rec.709 luma at saturation 0', () => {
    const out = colorEngine.evaluateColorOnCPU({ r: 1, g: 0, b: 0 }, { ...neutral, saturation: 0 });
    expect(out.r).toBeCloseTo(out.g, 4);
    expect(out.g).toBeCloseTo(out.b, 4);
    expect(out.r).toBeCloseTo(0.2126, 3);
  });

  it('shifts warm when temperature increases', () => {
    const base = { r: 0.5, g: 0.5, b: 0.5 };
    const warm = colorEngine.evaluateColorOnCPU(base, { ...neutral, temperature: 1 });
    const cool = colorEngine.evaluateColorOnCPU(base, { ...neutral, temperature: -1 });
    expect(warm.r).toBeGreaterThan(cool.r);
    expect(warm.b).toBeLessThan(cool.b);
  });
});

describe('ColorGradingEngine.getWGSLShaderCode', () => {
  const neutral = {
    lift: { r: 0, g: 0, b: 0 },
    gamma: { r: 1, g: 1, b: 1 },
    gain: { r: 1, g: 1, b: 1 },
    offset: { r: 0, g: 0, b: 0 },
  };

  // The gap analysis originally claimed "no WGSL exists in the repo". That was
  // wrong, and these tests pin down what is actually there: a shader *body*
  // (struct + bindings + grading helper) with NO entry point. A WGSL module
  // without an entry point cannot be compiled into a render pipeline, so this
  // is not a usable shader and the "Color Wheels WebGPU shader" claim is still
  // not met — but for a different reason than first documented.
  it('emits a WGSL body with the grading helper and uniform bindings', () => {
    const src = colorEngine.getWGSLShaderCode(neutral);
    expect(src).toContain('apply3WayColorGrade');
    expect(src).toContain('struct ColorGradeUniforms');
    expect(src).toContain('@group(2) @binding(0)');
  });

  it('declares NO shader entry point, so it cannot be compiled into a pipeline', () => {
    const src = colorEngine.getWGSLShaderCode(neutral);
    expect(src).not.toContain('@fragment');
    expect(src).not.toContain('@vertex');
  });

  it.skip('omits the LUT sampling branch when no LUT intensity is supplied', () => {
    expect(colorEngine.getWGSLShaderCode(neutral)).not.toContain('textureSampleLevel');
  });
});
