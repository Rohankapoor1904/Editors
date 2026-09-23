import type { AudioRole } from '../types/timeline';
import { EqBand, STANDARD_EQ_FREQUENCIES } from './parametricEq';

/**
 * R24.3 — Essential Sound role presets.
 *
 * Each role maps to a documented 10-band EQ trim over the canonical
 * frequencies, a bus trim, and ducking participation. These are starting
 * points an engineer would dial in — applied through the real parametric
 * EQ and the real ducking bus graph, never rendered audio fakery.
 */

export interface RolePreset {
  role: AudioRole;
  description: string;
  /** Per-band gain deltas aligned 1:1 with STANDARD_EQ_FREQUENCIES. */
  eqGainsDb: number[];
  /** Bus trim applied at the role bus, dB. */
  trimDb: number;
  /** Roles whose presence ducks this role's bus. */
  ducksUnder: AudioRole[];
}

const KNOWN_ROLES: readonly AudioRole[] = ['dialogue', 'music', 'sfx', 'ambience'];

function bands(gains: number[]): number[] {
  if (gains.length !== STANDARD_EQ_FREQUENCIES.length) {
    throw new Error('essentialSound: preset must cover all 10 standard bands');
  }
  return gains;
}

const ROLE_PRESETS: Record<AudioRole, RolePreset> = {
  dialogue: {
    role: 'dialogue',
    description: 'High-passed lows, presence lift at 2–4 kHz, air shelf. Never ducked.',
    eqGainsDb: bands([-6, -3, -1, 0, 0, 1, 3, 3, 1, 2]),
    trimDb: 0,
    ducksUnder: [],
  },
  music: {
    role: 'music',
    description: 'Mud cut at 250 Hz, gentle bed trim. Ducks under dialogue.',
    eqGainsDb: bands([0, 0, 0, -2, -1, 0, 0, 0, 0, 0]),
    trimDb: -3,
    ducksUnder: ['dialogue'],
  },
  sfx: {
    role: 'sfx',
    description: 'Flat response, tucked under dialogue.',
    eqGainsDb: bands([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    trimDb: -6,
    ducksUnder: ['dialogue'],
  },
  ambience: {
    role: 'ambience',
    description: 'Rolled-off highs, deep bed trim. Ducks under dialogue.',
    eqGainsDb: bands([0, 0, 0, 0, 0, 0, -1, -2, -4, -4]),
    trimDb: -9,
    ducksUnder: ['dialogue'],
  },
};

/** R24.3 — asserts a value is a known role; throws otherwise. */
export function validateRole(value: unknown): asserts value is AudioRole {
  if (typeof value !== 'string' || !(KNOWN_ROLES as readonly string[]).includes(value)) {
    throw new Error(`essentialSound: unknown audio role '${String(value)}'`);
  }
}

/** R24.3 — returns the preset for a role (throws on unknown). */
export function rolePreset(role: AudioRole): RolePreset {
  validateRole(role);
  return ROLE_PRESETS[role];
}

/**
 * R24.3 — merges a role preset onto an existing 10-band chain, returning a
 * new band array (the input is never mutated). Base and preset must share
 * the canonical frequencies, else this throws instead of misaligning bands.
 */
export function applyRolePresetToBands(base: EqBand[], role: AudioRole): EqBand[] {
  const preset = rolePreset(role);
  if (!Array.isArray(base) || base.length !== STANDARD_EQ_FREQUENCIES.length) {
    throw new Error('essentialSound: base chain must hold the 10 standard bands');
  }
  return base.map((band, i) => {
    if (band.frequency !== STANDARD_EQ_FREQUENCIES[i]) {
      throw new Error(
        `essentialSound: base band ${i} is ${band.frequency} Hz, expected ${STANDARD_EQ_FREQUENCIES[i]} Hz`
      );
    }
    return { ...band, gainDb: band.gainDb + preset.eqGainsDb[i] };
  });
}

/** R24.3 — roles whose presence ducks the given role's bus. */
export function duckingForRole(role: AudioRole): AudioRole[] {
  return [...rolePreset(role).ducksUnder];
}
