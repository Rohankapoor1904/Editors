import { describe, it, expect, afterEach } from 'vitest';
import {
  validateTitleSpec,
  wrapTitleText,
  layoutTitle,
  createTitleClip,
  titleTemplate,
  TITLE_TEMPLATES,
  loadTitleTemplates,
  saveTitleTemplate,
  clearCustomTitleTemplates,
} from './titles';
import { TitleSpec } from '../types/timeline';
import { createRational } from '../types/time';

const stubMeasure = (line: string, size: number): number => line.length * size * 0.5;

function spec(overrides: Partial<TitleSpec> = {}): TitleSpec {
  return {
    text: 'Hello World',
    fontFamily: 'Inter, sans-serif',
    fontSize: 0.08,
    color: '#ffffff',
    align: 'center',
    box: { x: 0.1, y: 0.4, w: 0.8, h: 0.2 },
    ...overrides,
  };
}

describe('R24.4 — title spec validation', () => {
  it('accepts a well-formed spec and rejects garbage loudly', () => {
    expect(() => validateTitleSpec(spec())).not.toThrow();
    expect(() => validateTitleSpec(spec({ text: '' }))).toThrow();
    expect(() => validateTitleSpec(spec({ fontSize: 0 }))).toThrow();
    expect(() => validateTitleSpec(spec({ fontSize: 2 }))).toThrow();
    expect(() => validateTitleSpec(spec({ align: 'justify' as never }))).toThrow();
    expect(() => validateTitleSpec(spec({ box: { x: 0, y: 0, w: 0, h: 0.2 } }))).toThrow();
    expect(() => validateTitleSpec(spec({ fadeInSec: -1 }))).toThrow();
  });
});

describe('R24.4 — word-wrap layout', () => {
  it('wraps greedily and honours explicit newlines', () => {
    // size 20 -> 10px/char; maxWidth 45 fits 4 chars.
    const lines = wrapTitleText('aa bb cc', stubMeasure, 20, 45);
    expect(lines.map((l) => l.text)).toEqual(['aa', 'bb', 'cc']);
    const paras = wrapTitleText('aa\nbb', stubMeasure, 20, 200);
    expect(paras.map((l) => l.text)).toEqual(['aa', 'bb']);
  });

  it('hard-splits an overlong word instead of overflowing', () => {
    const lines = wrapTitleText('abcdef', stubMeasure, 20, 25);
    expect(lines.map((l) => l.text)).toEqual(['ab', 'cd', 'ef']);
  });

  it('rejects invalid geometry inputs', () => {
    expect(() => wrapTitleText('x', stubMeasure, 0, 100)).toThrow();
    expect(() => wrapTitleText('x', stubMeasure, 20, -5)).toThrow();
  });

  it('computes 1.2x line metrics over the wrapped lines', () => {
    // Narrow box: 0.05 * 1000px = 50px fits one 2-char word per line.
    const layout = layoutTitle(
      spec({ text: 'aa bb cc', box: { x: 0, y: 0, w: 0.05, h: 0.2 } }),
      1000, 500, stubMeasure
    );
    expect(layout.lines.map((l) => l.text)).toEqual(['aa', 'bb', 'cc']);
    expect(layout.lineHeightPx).toBeCloseTo(0.08 * 500 * 1.2, 12);
    expect(layout.totalHeightPx).toBeCloseTo(3 * 0.08 * 500 * 1.2, 12);
  });
});

describe('R24.4 — title clips and templates', () => {
  it('builds a title clip on the stable pseudo-scheme with a copied spec', () => {
    const input = spec();
    const clip = createTitleClip({
      id: 't1',
      spec: input,
      startOffset: createRational(2, 1),
      duration: createRational(4, 1),
    });
    expect(clip.assetId).toBe('title://t1');
    expect(clip.title?.text).toBe('Hello World');
    input.box.x = 0.9;
    expect(clip.title?.box.x).toBe(0.1);
  });

  it('serves three built-ins, deep-copied, unknown ids throw', () => {
    expect(TITLE_TEMPLATES).toHaveLength(3);
    const a = titleTemplate('tpl-lower-third');
    a.spec.text = 'mutated';
    expect(titleTemplate('tpl-lower-third').spec.text).toBe('Name — Role');
    expect(() => titleTemplate('nope')).toThrow();
  });
});

describe('R24.4 — custom template library', () => {
  afterEach(() => {
    clearCustomTitleTemplates();
  });

  it('round-trips a custom template alongside built-ins', () => {
    clearCustomTitleTemplates();
    expect(loadTitleTemplates()).toHaveLength(3);
    saveTitleTemplate({
      id: 'tpl-custom-hook',
      name: 'Hook',
      spec: { ...titleTemplate('tpl-center-title').spec, text: 'Hook' },
    });
    const all = loadTitleTemplates();
    expect(all).toHaveLength(4);
    expect(all.find((t) => t.id === 'tpl-custom-hook')?.name).toBe('Hook');
  });

  it('rejects duplicate and colliding ids', () => {
    clearCustomTitleTemplates();
    const custom = {
      id: 'tpl-x',
      name: 'X',
      spec: { ...titleTemplate('tpl-center-title').spec, text: 'X' },
    };
    saveTitleTemplate(custom);
    expect(() => saveTitleTemplate(custom)).toThrow();
    expect(() => saveTitleTemplate({ ...custom, id: 'tpl-center-title' })).toThrow();
    expect(() => saveTitleTemplate({ ...custom, id: '' })).toThrow();
  });
});
