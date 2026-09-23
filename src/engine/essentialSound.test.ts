import { describe, it, expect } from 'vitest';
import { rolePreset, applyRolePresetToBands, duckingForRole, validateRole } from './essentialSound';
import { STANDARD_EQ_FREQUENCIES, EqBand } from './parametricEq';

function zeroBands(): EqBand[] {
  return STANDARD_EQ_FREQUENCIES.map((frequency, i) => ({
    frequency,
    gainDb: 0,
    q: 1.414,
    type: (i === 0 ? 'lowshelf' : i === STANDARD_EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking') as BiquadFilterType,
  }));
}

describe('R24.3 — role presets', () => {
  it('covers all four roles with 10 aligned bands and honest trims', () => {
    expect(rolePreset('dialogue').eqGainsDb).toHaveLength(10);
    expect(rolePreset('dialogue').trimDb).toBe(0);
    expect(rolePreset('music').trimDb).toBe(-3);
    expect(rolePreset('ambience').trimDb).toBe(-9);
    expect(() => validateRole('voiceover')).toThrow();
    expect(() => rolePreset('voiceover' as never)).toThrow();
  });

  it('merges preset deltas onto a base chain without mutating it', () => {
    const base = zeroBands();
    const merged = applyRolePresetToBands(base, 'dialogue');
    expect(merged[0].gainDb).toBe(-6);
    expect(merged[6].gainDb).toBe(3);
    expect(base[0].gainDb).toBe(0);
  });

  it('refuses misaligned base chains instead of shifting bands', () => {
    const shifted = zeroBands();
    shifted[3] = { ...shifted[3], frequency: 260 };
    expect(() => applyRolePresetToBands(shifted, 'music')).toThrow();
    expect(() => applyRolePresetToBands(zeroBands().slice(0, 8), 'music')).toThrow();
  });

  it('maps ducking participation: music/sfx/ambience duck under dialogue', () => {
    expect(duckingForRole('dialogue')).toEqual([]);
    expect(duckingForRole('music')).toEqual(['dialogue']);
    expect(duckingForRole('sfx')).toEqual(['dialogue']);
    expect(duckingForRole('ambience')).toEqual(['dialogue']);
  });
});
