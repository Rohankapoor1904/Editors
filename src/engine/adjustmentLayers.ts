import type { Clip } from '../types/timeline';
import { colorEngine, ColorGradeSettings, RGBColor } from './colorEngine';

/**
 * R26.1 — adjustment-layer resolution and application (CPU oracle).
 *
 * An adjustment clip carries an ordinary `colorGrade` effect and spans a
 * time range; every adjustment spanning time t applies in track order
 * (bottom-up compositing). applyAdjustments() runs the same evaluator the
 * per-clip grade path uses, so a grade on an adjustment layer renders
 * identically to the same grade on each covered clip (pinned by test).
 * GPU consumption rides the future DAG evaluation — the data contract
 * (clip.adjustment + colorGrade effect) is what this module guarantees.
 */

export interface ActiveAdjustment {
  clipId: string;
  grade: ColorGradeSettings;
}

/** R26.1 — grades of adjustment clips spanning timeSec, bottom-up. */
export function resolveActiveAdjustments(clips: Clip[], timeSec: number): ActiveAdjustment[] {
  if (!Array.isArray(clips)) throw new Error('adjustmentLayers: clips must be an array');
  if (typeof timeSec !== 'number' || !Number.isFinite(timeSec) || timeSec < 0) {
    throw new Error('adjustmentLayers: timeSec must be a finite non-negative number');
  }
  const active: ActiveAdjustment[] = [];
  for (const clip of clips) {
    if (!clip.adjustment) continue;
    const start = clip.startOffset.value / clip.startOffset.rate;
    const end = start + clip.duration.value / clip.duration.rate;
    if (timeSec >= start && timeSec < end) {
      const grade = clip.effects?.find((e) => e.type === 'colorGrade' && e.enabled !== false);
      if (grade) {
        active.push({ clipId: clip.id, grade: grade.params as unknown as ColorGradeSettings });
      }
    }
  }
  return active;
}

/** R26.1 — sequential application of adjustment grades (track order). */
export function applyAdjustments(input: RGBColor, adjustments: ActiveAdjustment[]): RGBColor {
  let current: RGBColor = { ...input };
  for (const adj of adjustments) {
    current = colorEngine.evaluateColorOnCPU(current, adj.grade);
  }
  return current;
}
