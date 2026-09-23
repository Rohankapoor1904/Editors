import { describe, it, expect } from 'vitest';
import { downmix51ToStereo, upmixStereoTo51, SURROUND_FOLD_GAIN, SURROUND_51_CHANNELS } from './surround';

describe('R26.2 — 5.1 channel model', () => {
  it('declares the canonical six-channel order', () => {
    expect([...SURROUND_51_CHANNELS]).toEqual(['L', 'R', 'C', 'LFE', 'Ls', 'Rs']);
    expect(SURROUND_FOLD_GAIN).toBeCloseTo(0.7071, 4);
  });

  it('downmixes with exact ITU gains (LFE dropped)', () => {
    const out = downmix51ToStereo({ L: 1, R: 0.5, C: 1, LFE: 1, Ls: 0, Rs: 0.5 });
    expect(out.left).toBeCloseTo(1 + SURROUND_FOLD_GAIN, 12);
    expect(out.right).toBeCloseTo(0.5 + SURROUND_FOLD_GAIN + SURROUND_FOLD_GAIN * 0.5, 12);
    // Silence in, silence out.
    expect(downmix51ToStereo({ L: 0, R: 0, C: 0, LFE: 0, Ls: 0, Rs: 0 })).toEqual({ left: 0, right: 0 });
    expect(() =>
      downmix51ToStereo({ L: 0, R: 0, C: 0, LFE: 0, Ls: 0, Rs: NaN })
    ).toThrow();
  });

  it('upmixes stereo with explicit silent surrounds', () => {
    expect(upmixStereoTo51(0.5, -0.25)).toEqual({ L: 0.5, R: -0.25, C: 0.125, LFE: 0, Ls: 0, Rs: 0 });
    expect(() => upmixStereoTo51(Infinity, 0)).toThrow();
  });
});
