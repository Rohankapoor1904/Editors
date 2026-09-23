import type { RGBColor } from './colorEngine';

/**
 * R24.2 — HSL secondary qualifier + isolated grade.
 *
 * Selects pixels by hue (circular), saturation and luma windows, each with
 * a softness band, and blends a secondary lift/gain by the resulting
 * weight. All math is over caller-supplied pixels — there is no sampling,
 * no tracking, and no invented key.
 */

export interface HSLSecondarySelection {
  /** Hue center, cycles 0..1. */
  hueCenter: number;
  /** Full gate width in hue cycles, (0,1]. */
  hueWidth: number;
  /** Soft falloff beyond the gate, in hue cycles, 0..0.5. */
  hueSoftness: number;
  satMin: number;
  satMax: number;
  lumaMin: number;
  lumaMax: number;
  /** Soft falloff for the sat/luma box edges, 0..0.5. */
  boxSoftness: number;
}

export interface SecondaryGrade {
  lift: RGBColor;
  gain: RGBColor;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** R24.2 — standard RGB→HSL, all outputs normalized [0,1]. */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  if (![r, g, b].every(isFiniteNumber)) {
    throw new Error('hslSecondary: rgb inputs must be finite');
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function boxWeight(value: number, lo: number, hi: number, soft: number): number {
  // Zero softness is a hard box with inclusive edges; otherwise smoothstep
  // both sides. (Inclusive: a qualifier of satMax 1 must still match s = 1.)
  if (soft === 0) return value >= lo && value <= hi ? 1 : 0;
  return smoothstep(lo - soft, lo, value) * (1 - smoothstep(hi, hi + soft, value));
}

/** R24.2 — validates the qualifier; throws instead of clamping. */
export function validateSecondarySelection(sel: HSLSecondarySelection): void {
  const fail = (msg: string): never => {
    throw new Error(`hslSecondary: ${msg}`);
  };
  if (!isFiniteNumber(sel.hueCenter) || sel.hueCenter < 0 || sel.hueCenter > 1) fail('hueCenter must be within [0,1]');
  if (!isFiniteNumber(sel.hueWidth) || sel.hueWidth <= 0 || sel.hueWidth > 1) fail('hueWidth must be within (0,1]');
  if (!isFiniteNumber(sel.hueSoftness) || sel.hueSoftness < 0 || sel.hueSoftness > 0.5) {
    fail('hueSoftness must be within [0,0.5]');
  }
  for (const [name, v] of [['satMin', sel.satMin], ['satMax', sel.satMax], ['lumaMin', sel.lumaMin], ['lumaMax', sel.lumaMax]] as const) {
    if (!isFiniteNumber(v) || v < 0 || v > 1) fail(`${name} must be within [0,1]`);
  }
  if (sel.satMin > sel.satMax) fail('satMin must not exceed satMax');
  if (sel.lumaMin > sel.lumaMax) fail('lumaMin must not exceed lumaMax');
  if (!isFiniteNumber(sel.boxSoftness) || sel.boxSoftness < 0 || sel.boxSoftness > 0.5) {
    fail('boxSoftness must be within [0,0.5]');
  }
}

/** R24.2 — qualifier weight in [0,1]; hue distance wraps the 0/1 seam. */
export function secondaryWeight(rgb: RGBColor, sel: HSLSecondarySelection): number {
  validateSecondarySelection(sel);
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hueDistance = Math.min(Math.abs(h - sel.hueCenter), 1 - Math.abs(h - sel.hueCenter));
  const halfGate = sel.hueWidth / 2;
  // Zero softness is a hard gate with an inclusive edge.
  const hueW =
    sel.hueSoftness === 0
      ? hueDistance <= halfGate ? 1 : 0
      : 1 - smoothstep(halfGate, halfGate + sel.hueSoftness, hueDistance);
  const satW = boxWeight(s, sel.satMin, sel.satMax, sel.boxSoftness);
  const lumaW = boxWeight(l, sel.lumaMin, sel.lumaMax, sel.boxSoftness);
  return hueW * satW * lumaW;
}

/** R24.2 — blends (rgb + lift) * gain by the qualifier weight. */
export function applySecondaryGrade(rgb: RGBColor, sel: HSLSecondarySelection, grade: SecondaryGrade): RGBColor {
  const w = secondaryWeight(rgb, sel);
  if (w <= 0) return { ...rgb };
  const inside: RGBColor = {
    r: Math.max(0, rgb.r + grade.lift.r) * grade.gain.r,
    g: Math.max(0, rgb.g + grade.lift.g) * grade.gain.g,
    b: Math.max(0, rgb.b + grade.lift.b) * grade.gain.b,
  };
  return {
    r: rgb.r + (inside.r - rgb.r) * w,
    g: rgb.g + (inside.g - rgb.g) * w,
    b: rgb.b + (inside.b - rgb.b) * w,
  };
}
