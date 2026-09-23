import { describe, it, expect } from 'vitest';
import {
  emptyLane,
  validateLane,
  evaluateLane,
  recordAutomation,
  dbToLinear,
  linearToDb,
} from './automation';

describe('R26.2 — lane evaluation', () => {
  it('renders a 2-point ramp exactly and clamps the ends', () => {
    const lane = { mode: 'snap' as const, points: [{ timeSec: 1, value: -12 }, { timeSec: 3, value: 0 }] };
    expect(evaluateLane(lane, 0)).toBe(-12);
    expect(evaluateLane(lane, 2)).toBe(-6);
    expect(evaluateLane(lane, 5)).toBe(0);
    expect(evaluateLane({ mode: 'snap', points: [] }, 2)).toBeNull();
    expect(() => evaluateLane(lane, NaN)).toThrow();
  });

  it('rejects unsorted and dirty lanes instead of interpolating', () => {
    expect(() =>
      validateLane({ mode: 'snap', points: [{ timeSec: 2, value: 0 }, { timeSec: 1, value: 0 }] })
    ).toThrow();
    expect(() => validateLane({ mode: 'warp' as never, points: [] })).toThrow();
    expect(() => emptyLane('warp' as never)).toThrow();
  });

  it('converts dB gains exactly', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.5012, 4);
    expect(linearToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(() => linearToDb(0)).toThrow();
  });
});

describe('R26.2 — write modes preserve values', () => {
  const base = {
    mode: 'snap' as const,
    points: [
      { timeSec: 0, value: -10 },
      { timeSec: 5, value: -10 },
      { timeSec: 10, value: -10 },
    ],
  };

  it('snap replaces only inside the punch window', () => {
    const out = recordAutomation(base, [{ timeSec: 4, value: 0 }, { timeSec: 6, value: 0 }], {
      punchInSec: 4,
      punchOutSec: 6,
    });
    expect(out.points.map((p) => p.timeSec)).toEqual([0, 4, 6, 10]);
    expect(out.points[0].value).toBe(-10);
    expect(out.points[3].value).toBe(-10);
    expect(() => recordAutomation(base, [{ timeSec: 1, value: 0 }], { punchInSec: 5, punchOutSec: 2 })).toThrow();
  });

  it('latch merges writes by time, keeping the rest', () => {
    const latched = recordAutomation({ ...base, mode: 'latch' }, [{ timeSec: 5, value: -2 }]);
    expect(latched.points).toEqual([
      { timeSec: 0, value: -10 },
      { timeSec: 5, value: -2 },
      { timeSec: 10, value: -10 },
    ]);
  });

  it('trim shifts the whole lane uniformly', () => {
    const trimmed = recordAutomation({ ...base, mode: 'trim' }, [{ timeSec: 5, value: -4 }]);
    // Write mean (-4) minus base mean (-10) = +6 shift on every point.
    expect(trimmed.points.every((p) => p.value === -4)).toBe(true);
    expect(() => recordAutomation(emptyLane('trim'), [{ timeSec: 1, value: 0 }])).toThrow();
  });

  it('never mutates inputs and rejects empty passes', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    recordAutomation(base, [{ timeSec: 4, value: 0 }], { punchInSec: 4, punchOutSec: 4 });
    expect(base).toEqual(snapshot);
    expect(() => recordAutomation(base, [])).toThrow();
  });
});
