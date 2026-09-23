import { ClipMask, MaskShape, MaskSubjectClass } from '../../types/timeline';

const KNOWN_SHAPES: readonly MaskShape[] = ['rect', 'ellipse'];
const KNOWN_CLASSES: readonly MaskSubjectClass[] = [
  'person',
  'skin',
  'hair',
  'sky',
  'foliage',
  'clothing',
  'custom',
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * R24.1 — validates a mask on the main path.
 * Throws a descriptive Error for any out-of-range value instead of
 * silently clamping (invariant §5.5: fail loudly, never invent geometry).
 */
export function validateMask(mask: ClipMask): void {
  if (!mask || typeof mask.id !== 'string' || mask.id.length === 0) {
    throw new Error('ClipMask requires a non-empty id');
  }
  if (!KNOWN_SHAPES.includes(mask.shape)) {
    throw new Error(`ClipMask '${mask.id}' has unknown shape '${mask.shape}'`);
  }
  if (!KNOWN_CLASSES.includes(mask.subjectClass)) {
    throw new Error(`ClipMask '${mask.id}' has unknown subjectClass '${mask.subjectClass}'`);
  }
  if (!isFiniteNumber(mask.centerX) || mask.centerX < 0 || mask.centerX > 1) {
    throw new Error(`ClipMask '${mask.id}' centerX must be within [0,1]`);
  }
  if (!isFiniteNumber(mask.centerY) || mask.centerY < 0 || mask.centerY > 1) {
    throw new Error(`ClipMask '${mask.id}' centerY must be within [0,1]`);
  }
  if (!isFiniteNumber(mask.sizeX) || mask.sizeX <= 0 || mask.sizeX > 1) {
    throw new Error(`ClipMask '${mask.id}' sizeX must be within (0,1]`);
  }
  if (!isFiniteNumber(mask.sizeY) || mask.sizeY <= 0 || mask.sizeY > 1) {
    throw new Error(`ClipMask '${mask.id}' sizeY must be within (0,1]`);
  }
  const rotation = mask.rotation ?? 0;
  if (!isFiniteNumber(rotation)) {
    throw new Error(`ClipMask '${mask.id}' rotation must be finite radians`);
  }
  const feather = mask.feather ?? 0;
  if (!isFiniteNumber(feather) || feather < 0 || feather > 1) {
    throw new Error(`ClipMask '${mask.id}' feather must be within [0,1]`);
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * R24.1 — soft alpha of a mask at a normalized point, in [0,1].
 * Feather widens the transition band; invert selects outside the shape.
 * Pure geometry over caller-supplied coordinates — no media is read here.
 */
export function maskAlphaAt(mask: ClipMask, x: number, y: number): number {
  validateMask(mask);
  const theta = mask.rotation ?? 0;
  const feather = mask.feather ?? 0;
  const dx = x - mask.centerX;
  const dy = y - mask.centerY;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // Rotate the sample point by -theta into the mask's local frame.
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;

  let alpha: number;
  if (mask.shape === 'rect') {
    const hx = mask.sizeX / 2;
    const hy = mask.sizeY / 2;
    const edgeDistance = Math.min(hx - Math.abs(rx), hy - Math.abs(ry));
    if (feather === 0) {
      alpha = edgeDistance >= 0 ? 1 : 0;
    } else {
      alpha = smoothstep(0, feather * Math.min(hx, hy), edgeDistance);
    }
  } else {
    const hx = mask.sizeX / 2;
    const hy = mask.sizeY / 2;
    const r = Math.sqrt((rx / hx) * (rx / hx) + (ry / hy) * (ry / hy));
    if (feather === 0) {
      alpha = r <= 1 ? 1 : 0;
    } else {
      alpha = 1 - smoothstep(1 - feather, 1, r);
    }
  }

  return mask.invert ? 1 - alpha : alpha;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * R24.1 — intersection-over-union for two rects in identical units.
 * Used to score propagated mask boxes against ground truth in tests.
 * Degenerate (zero-union) input yields 0 rather than NaN.
 */
export function rectIoU(a: Rect, b: Rect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  if (union <= 0) return 0;
  return inter / union;
}
