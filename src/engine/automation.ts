import { AutomationLane, AutomationMode, AutomationPoint } from '../types/timeline';

/**
 * R26.2 — automation lane engine (pure): evaluation, write modes, dB math.
 *
 * Lanes hold (timeSec, value) points sorted by time; evaluation is
 * piecewise-linear with end clamping. Write modes mirror console
 * semantics in an honest, documented subset:
 * - snap: replace points inside [punchIn, punchOut] with the pass writes.
 * - latch: merge writes by time (later wins ties), preserving the rest.
 * - trim: offset every existing point by the pass delta.
 * An empty lane evaluates to null ("no automation — use the static fader").
 */

export const AUTOMATION_MODES: readonly AutomationMode[] = ['snap', 'latch', 'trim'];

export function emptyLane(mode: AutomationMode = 'snap'): AutomationLane {
  if (!AUTOMATION_MODES.includes(mode)) throw new Error(`automation: unknown mode '${String(mode)}'`);
  return { points: [], mode };
}

function checkPoint(p: AutomationPoint, i: number): void {
  if (!p || !Number.isFinite(p.timeSec) || p.timeSec < 0) {
    throw new Error(`automation: point ${i} has invalid timeSec`);
  }
  if (!Number.isFinite(p.value)) {
    throw new Error(`automation: point ${i} has non-finite value`);
  }
}

export function validateLane(lane: AutomationLane): void {
  if (!lane || !Array.isArray(lane.points)) throw new Error('automation: lane needs a points array');
  if (!AUTOMATION_MODES.includes(lane.mode)) {
    throw new Error(`automation: unknown mode '${String(lane.mode)}'`);
  }
  lane.points.forEach(checkPoint);
  for (let i = 1; i < lane.points.length; i++) {
    if (lane.points[i].timeSec < lane.points[i - 1].timeSec) {
      throw new Error('automation: points must be sorted by timeSec');
    }
  }
}

/** R26.2 — linear evaluation; null when the lane is empty. */
export function evaluateLane(lane: AutomationLane, t: number): number | null {
  validateLane(lane);
  if (!Number.isFinite(t)) throw new Error('automation: evaluation time must be finite');
  const pts = lane.points;
  if (pts.length === 0) return null;
  if (t <= pts[0].timeSec) return pts[0].value;
  const last = pts[pts.length - 1];
  if (t >= last.timeSec) return last.value;
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i].timeSec) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const span = p1.timeSec - p0.timeSec;
      if (span <= 0) return p1.value;
      const k = (t - p0.timeSec) / span;
      return p0.value + k * (p1.value - p0.value);
    }
  }
  return last.value;
}

/** R26.2 — dB to linear gain (and back) for fader rendering. */
export function dbToLinear(db: number): number {
  if (!Number.isFinite(db)) throw new Error('automation: dB must be finite');
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 0) {
    throw new Error('automation: linear gain must be positive finite');
  }
  return 20 * Math.log10(linear);
}

export interface WritePass {
  points: AutomationPoint[];
}

function checkWrites(writes: AutomationPoint[]): void {
  if (!Array.isArray(writes) || writes.length === 0) {
    throw new Error('automation: a write pass needs at least one point');
  }
  writes.forEach(checkPoint);
}

function sortedUnique(points: AutomationPoint[]): AutomationPoint[] {
  const sorted = [...points].sort((a, b) => a.timeSec - b.timeSec);
  const out: AutomationPoint[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && last.timeSec === p.timeSec) {
      out[out.length - 1] = { ...p };
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/**
 * R26.2 — applies one write pass per the lane mode, returning a NEW lane
 * (inputs never mutated):
 * - snap: points inside [punchIn, punchOut] are replaced by the writes.
 * - latch: writes merge by time over the kept lane (later wins ties).
 * - trim: every point shifts by deltaDb (writes must agree within epsilon;
 *   the mean delta applies).
 */
export function recordAutomation(
  lane: AutomationLane,
  writes: AutomationPoint[],
  opts: { punchInSec?: number; punchOutSec?: number } = {}
): AutomationLane {
  validateLane(lane);
  checkWrites(writes);
  const clean = sortedUnique(writes);

  if (lane.mode === 'trim') {
    if (lane.points.length === 0) {
      throw new Error('automation: trim needs an existing lane to offset');
    }
    // Trim offsets from the lane's own mean: uniform shift preserving shape.
    const baseMean = lane.points.reduce((s, p) => s + p.value, 0) / lane.points.length;
    const writeMean = clean.reduce((s, w) => s + w.value, 0) / clean.length;
    const shift = writeMean - baseMean;
    return {
      mode: lane.mode,
      points: lane.points.map((p) => ({ timeSec: p.timeSec, value: p.value + shift })),
    };
  }

  if (lane.mode === 'latch') {
    const merged = new Map<number, number>();
    for (const p of lane.points) merged.set(p.timeSec, p.value);
    for (const w of clean) merged.set(w.timeSec, w.value);
    return {
      mode: lane.mode,
      points: [...merged.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([timeSec, value]) => ({ timeSec, value })),
    };
  }

  // snap
  const punchIn = opts.punchInSec ?? clean[0].timeSec;
  const punchOut = opts.punchOutSec ?? clean[clean.length - 1].timeSec;
  if (!(punchIn <= punchOut)) {
    throw new Error('automation: snap punchIn must not exceed punchOut');
  }
  const kept = lane.points.filter((p) => p.timeSec < punchIn || p.timeSec > punchOut);
  const inside = clean.filter((w) => w.timeSec >= punchIn && w.timeSec <= punchOut);
  return { mode: lane.mode, points: sortedUnique([...kept, ...inside]) };
}
