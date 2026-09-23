import { describe, it, expect } from 'vitest';
import { nearestBeat, planBeatCuts } from './beatCut';

const BEATS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];

describe('R25.4 — nearest-beat snaps', () => {
  it('snaps to the closest beat and rejects bad input', () => {
    expect(nearestBeat(1.2, BEATS)).toBe(1.0);
    expect(nearestBeat(1.3, BEATS)).toBe(1.5);
    expect(() => nearestBeat(1.0, [])).toThrow();
    expect(() => nearestBeat(-1, BEATS)).toThrow();
  });
});

describe('R25.4 acceptance — cuts land within half a beat interval', () => {
  it('places 3 cuts on beats across a 4s track', () => {
    const cuts = planBeatCuts(4, BEATS, 3);
    expect(cuts).toEqual([1.0, 2.0, 3.0]);
    for (const c of cuts) {
      const dist = Math.min(...BEATS.map((b) => Math.abs(b - c)));
      expect(dist).toBeLessThanOrEqual(0.25);
    }
  });

  it('dedupes collisions and refuses beatless ranges', () => {
    const sparse = planBeatCuts(4, [1.9, 2.1], 4);
    expect(sparse.length).toBeLessThanOrEqual(2);
    expect(new Set(sparse).size).toBe(sparse.length);
    expect(() => planBeatCuts(4, [9.0], 2)).toThrow(/inside the clip range/);
    expect(() => planBeatCuts(0, BEATS, 2)).toThrow();
    expect(() => planBeatCuts(4, BEATS, 0)).toThrow();
  });
});
