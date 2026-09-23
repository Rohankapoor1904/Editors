import { describe, it, expect } from 'vitest';
import { creatorTemplate, validateCreatorTemplate, captionPresetUpdates, CREATOR_TEMPLATES } from './creatorTemplates';

describe('R25.4 — creator template library', () => {
  it('ships three validated templates with distinct canvases', () => {
    expect(CREATOR_TEMPLATES).toHaveLength(3);
    for (const t of CREATOR_TEMPLATES) {
      expect(() => validateCreatorTemplate(t)).not.toThrow();
      expect(creatorTemplate(t.id)).toEqual(t);
    }
    expect(CREATOR_TEMPLATES.map((t) => `${t.canvasWidth}x${t.canvasHeight}`)).toEqual([
      '1080x1920',
      '1920x1080',
      '1080x1080',
    ]);
    expect(() => creatorTemplate('nope')).toThrow();
    expect(() =>
      validateCreatorTemplate({ ...CREATOR_TEMPLATES[0], captionPreset: 'vaporwave' as never })
    ).toThrow();
  });

  it('targets only caption effects that carry words', () => {
    const clips = [
      { id: 'c1', effects: [{ id: 'e1', type: 'caption', enabled: true, params: { preset: 'minimal', words: [{ word: 'hi' }] } }] },
      { id: 'c2', effects: [{ id: 'e2', type: 'caption', enabled: true, params: { preset: 'minimal', words: [] } }] },
      { id: 'c3', effects: [] },
      { id: 'c4' },
    ];
    const { updates, skipped } = captionPresetUpdates(clips, 'hormozi');
    expect(updates).toEqual([{ clipId: 'c1', effectId: 'e1', preset: 'hormozi' }]);
    expect(skipped).toBe(3);
    expect(() => captionPresetUpdates(clips, 'vaporwave' as never)).toThrow();
  });
});
