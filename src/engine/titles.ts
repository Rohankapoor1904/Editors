import { TitleSpec, TitleBox, TitleAlign, Clip } from '../types/timeline';
import { RationalTime } from '../types/time';

/**
 * R24.4 — title/motion-graphics engine: validation, word-wrap layout with
 * caller-supplied measurement, title-clip construction, built-in templates
 * and a localStorage-backed custom template library.
 *
 * Text measurement is injected (`measure(line, fontSizePx) => widthPx`)
 * because metrics belong to the rendering surface (canvas in the app,
 * stub in tests) — the layout algorithm itself is pure and fully tested.
 */

export type TextMeasure = (line: string, fontSizePx: number) => number;

const KNOWN_ALIGNS: readonly TitleAlign[] = ['left', 'center', 'right'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function checkBox(box: TitleBox, label: string): void {
  for (const [name, v] of [['x', box.x], ['y', box.y], ['w', box.w], ['h', box.h]] as const) {
    if (!isFiniteNumber(v) || v < 0 || v > 1) {
      throw new Error(`titles: ${label} box.${name} must be within [0,1]`);
    }
  }
  if (box.w <= 0 || box.h <= 0) {
    throw new Error(`titles: ${label} box needs positive w/h`);
  }
}

/** R24.4 — validates a title spec; throws instead of repairing. */
export function validateTitleSpec(spec: TitleSpec): void {
  if (!spec || typeof spec.text !== 'string' || spec.text.length === 0) {
    throw new Error('titles: text must be a non-empty string');
  }
  if (typeof spec.fontFamily !== 'string' || spec.fontFamily.length === 0) {
    throw new Error('titles: fontFamily must be non-empty');
  }
  if (!isFiniteNumber(spec.fontSize) || spec.fontSize <= 0 || spec.fontSize > 1) {
    throw new Error('titles: fontSize must be within (0,1] frame-height fractions');
  }
  if (typeof spec.color !== 'string' || spec.color.length === 0) {
    throw new Error('titles: color must be a non-empty CSS color');
  }
  if (!KNOWN_ALIGNS.includes(spec.align)) {
    throw new Error(`titles: unknown align '${String(spec.align)}'`);
  }
  if (!spec.box) throw new Error('titles: box is required');
  checkBox(spec.box, 'title');
  for (const [name, v] of [['fadeInSec', spec.fadeInSec], ['fadeOutSec', spec.fadeOutSec]] as const) {
    if (v !== undefined && (!isFiniteNumber(v) || v < 0)) {
      throw new Error(`titles: ${name} must be >= 0 when present`);
    }
  }
}

export interface LaidOutLine {
  text: string;
  /** Width in px per the injected measure. */
  widthPx: number;
}

/**
 * R24.4 — greedy word-wrap to maxWidthPx. Overlong single words hard-split
 * char-wise (documented, tested) rather than overflowing the box.
 */
export function wrapTitleText(text: string, measure: TextMeasure, fontSizePx: number, maxWidthPx: number): LaidOutLine[] {
  if (typeof text !== 'string') throw new Error('titles: text must be a string');
  if (!isFiniteNumber(fontSizePx) || fontSizePx <= 0) throw new Error('titles: fontSizePx must be positive');
  if (!isFiniteNumber(maxWidthPx) || maxWidthPx <= 0) throw new Error('titles: maxWidthPx must be positive');
  const lines: LaidOutLine[] = [];
  const push = (line: string): void => {
    lines.push({ text: line, widthPx: measure(line, fontSizePx) });
  };
  for (const rawParagraph of text.split('\n')) {
    if (rawParagraph.length === 0) {
      push('');
      continue;
    }
    let current = '';
    for (const word of rawParagraph.split(/\s+/).filter((w) => w.length > 0)) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (measure(candidate, fontSizePx) <= maxWidthPx) {
        current = candidate;
        continue;
      }
      if (current.length > 0) push(current);
      // The word alone still overflows: hard-split it char-wise.
      if (measure(word, fontSizePx) > maxWidthPx) {
        let chunk = '';
        for (const ch of word) {
          const next = chunk + ch;
          if (measure(next, fontSizePx) <= maxWidthPx || chunk.length === 0) {
            chunk = next;
          } else {
            push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    push(current);
  }
  return lines;
}

export interface TitleLayout {
  lines: LaidOutLine[];
  lineHeightPx: number;
  totalHeightPx: number;
}

/**
 * R24.4 — lays out a validated spec into positioned lines for a frame of
 * the given pixel size. Line height is 1.2× font size (typographic norm).
 */
export function layoutTitle(
  spec: TitleSpec,
  frameWidthPx: number,
  frameHeightPx: number,
  measure: TextMeasure
): TitleLayout {
  validateTitleSpec(spec);
  if (!isFiniteNumber(frameWidthPx) || frameWidthPx <= 0) throw new Error('titles: frameWidthPx must be positive');
  if (!isFiniteNumber(frameHeightPx) || frameHeightPx <= 0) throw new Error('titles: frameHeightPx must be positive');
  const fontSizePx = spec.fontSize * frameHeightPx;
  const maxWidthPx = spec.box.w * frameWidthPx;
  const lines = wrapTitleText(spec.text, measure, fontSizePx, maxWidthPx);
  const lineHeightPx = fontSizePx * 1.2;
  return { lines, lineHeightPx, totalHeightPx: lines.length * lineHeightPx };
}

// ---------------------------------------------------------------------------
// Title clips + templates
// ---------------------------------------------------------------------------

export interface TitleClipInput {
  id: string;
  name?: string;
  spec: TitleSpec;
  startOffset: RationalTime;
  duration: RationalTime;
}

/**
 * R24.4 — builds a timeline clip carrying a title spec. The assetId uses
 * the stable `title://` pseudo-scheme so title clips never collide with
 * file-backed assets and are trivially identifiable on every path.
 */
export function createTitleClip(input: TitleClipInput): Clip {
  validateTitleSpec(input.spec);
  if (!input.id) throw new Error('titles: clip id is required');
  return {
    id: input.id,
    assetId: `title://${input.id}`,
    name: input.name ?? input.spec.text.split('\n')[0].slice(0, 48),
    startOffset: input.startOffset,
    sourceIn: input.startOffset,
    sourceOut: input.startOffset,
    duration: input.duration,
    title: { ...input.spec, box: { ...input.spec.box } },
  };
}

/** R24.4 — built-in bumper templates (intro/outro/center/lower-third). */
export interface TitleTemplate {
  id: string;
  name: string;
  spec: Omit<TitleSpec, 'text' | 'templateId'> & { text: string };
}

export const TITLE_TEMPLATES: TitleTemplate[] = [
  {
    id: 'tpl-center-title',
    name: 'Center Title',
    spec: {
      text: 'Your Title',
      fontFamily: 'Inter, sans-serif',
      fontSize: 0.09,
      color: '#ffffff',
      align: 'center',
      box: { x: 0.1, y: 0.38, w: 0.8, h: 0.24 },
    },
  },
  {
    id: 'tpl-lower-third',
    name: 'Lower Third',
    spec: {
      text: 'Name — Role',
      fontFamily: 'Inter, sans-serif',
      fontSize: 0.05,
      color: '#ffffff',
      background: 'rgba(0,0,0,0.55)',
      align: 'left',
      box: { x: 0.06, y: 0.74, w: 0.5, h: 0.18 },
    },
  },
  {
    id: 'tpl-outro-bumper',
    name: 'Outro Bumper',
    spec: {
      text: 'Thanks for watching',
      fontFamily: 'Inter, sans-serif',
      fontSize: 0.07,
      color: '#f5f5f5',
      align: 'center',
      box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 },
      fadeInSec: 0.4,
      fadeOutSec: 0.4,
    },
  },
];

/** R24.4 — returns a deep copy of a built-in template (throws unknown). */
export function titleTemplate(id: string): TitleTemplate {
  const found = TITLE_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`titles: unknown template '${id}'`);
  return JSON.parse(JSON.stringify(found)) as TitleTemplate;
}

// ---------------------------------------------------------------------------
// Custom template library (localStorage-backed, in-memory fallback)
// ---------------------------------------------------------------------------

const LIB_KEY = 'cinecraft.titleTemplates.v1';
let memoryLibrary: TitleTemplate[] = [];

function storage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Non-DOM host (or denied access): fall back to memory below.
  }
  return null;
}

/** R24.4 — built-ins plus user-saved custom templates. */
export function loadTitleTemplates(): TitleTemplate[] {
  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(LIB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TitleTemplate[];
        if (Array.isArray(parsed)) {
          return [...TITLE_TEMPLATES.map((t) => titleTemplate(t.id)), ...parsed];
        }
      }
    } catch {
      // Corrupt entry: ignore it and serve built-ins (never crash the panel).
    }
  }
  return [...TITLE_TEMPLATES.map((t) => titleTemplate(t.id)), ...memoryLibrary.map((t) => ({ ...t }))];
}

/** R24.4 — persists a custom template (id must be unique). */
export function saveTitleTemplate(template: TitleTemplate): void {
  if (!template || typeof template.id !== 'string' || template.id.length === 0) {
    throw new Error('titles: custom template needs a non-empty id');
  }
  if (TITLE_TEMPLATES.some((t) => t.id === template.id)) {
    throw new Error(`titles: id '${template.id}' collides with a built-in template`);
  }
  const existing = loadTitleTemplates();
  if (existing.some((t) => t.id === template.id)) {
    throw new Error(`titles: template id '${template.id}' already saved`);
  }
  const copy = JSON.parse(JSON.stringify(template)) as TitleTemplate;
  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(LIB_KEY);
      const parsed: TitleTemplate[] = raw ? (JSON.parse(raw) as TitleTemplate[]) : [];
      parsed.push(copy);
      store.setItem(LIB_KEY, JSON.stringify(parsed));
      return;
    } catch {
      // Storage denied: fall through to memory so the session still works.
    }
  }
  memoryLibrary.push(copy);
}

/** R24.4 — test/maintenance helper: clears the custom library. */
export function clearCustomTitleTemplates(): void {
  memoryLibrary = [];
  const store = storage();
  if (store) {
    try {
      store.removeItem(LIB_KEY);
    } catch {
      // Ignore: memory already cleared.
    }
  }
}
