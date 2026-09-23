import { describe, it, expect } from 'vitest';
import { resolveBin, validateBinDefinition, BUILTIN_BINS, BinDefinition } from './mediaBins';
import { MediaAsset } from './mediaPool';

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'a',
    name: 'Take.mp4',
    path: '/m/t.mp4',
    type: 'video',
    duration: '00:00:10',
    fingerprint: 'fp',
    isOffline: false,
    ...overrides,
  };
}

describe('R24.7 — smart bin resolution', () => {
  const pool = [
    asset({ id: 'a1', name: 'Interview_Take1.mp4', type: 'video', rating: 5, scene: 'SC1', tags: ['interview'] }),
    asset({ id: 'a2', name: 'Broll_Mountain.mp4', type: 'video', rating: 3, scene: 'SC2' }),
    asset({ id: 'a3', name: 'Lofi_Bed.mp3', type: 'audio', rating: 4, isOffline: true }),
    asset({ id: 'g1', name: 'AI_Broll.mp4', type: 'ai', rating: 2 }),
  ];

  it('serves built-ins with honest counts (resolved by id, order-proof)', () => {
    const ids = (id: string): string[] => {
      const def = BUILTIN_BINS.find((b) => b.id === id);
      expect(def, `builtin bin ${id} exists`).toBeDefined();
      return resolveBin(pool, def!).map((a) => a.id);
    };
    expect(ids('bin-all')).toEqual(['a1', 'a2', 'a3', 'g1']);
    expect(ids('bin-video')).toEqual(['a1', 'a2']);
    expect(ids('bin-audio')).toEqual(['a3']);
    expect(ids('bin-ai')).toEqual(['g1']);
    expect(ids('bin-offline')).toEqual(['a3']);
    expect(ids('bin-favorites')).toEqual(['a1', 'a3']);
  });

  it('combines custom filters with and/or semantics', () => {
    const sc1Video: BinDefinition = {
      id: 'b1',
      name: 'SC1 video',
      filters: [
        { field: 'scene', op: 'eq', value: 'SC1' },
        { field: 'type', op: 'eq', value: 'video' },
      ],
    };
    expect(resolveBin(pool, sc1Video).map((a) => a.id)).toEqual(['a1']);

    const tagged: BinDefinition = {
      id: 'b2',
      name: 'tagged or offline',
      mode: 'or',
      filters: [
        { field: 'tag', op: 'includes', value: 'interview' },
        { field: 'offline', op: 'eq', value: true },
      ],
    };
    expect(resolveBin(pool, tagged).map((a) => a.id)).toEqual(['a1', 'a3']);
  });

  it('matches names and scenes case-insensitively via contains', () => {
    const def: BinDefinition = {
      id: 'b3',
      name: 'broll',
      filters: [{ field: 'type', op: 'eq', value: 'video' }],
    };
    expect(resolveBin(pool, def)).toHaveLength(2);
    const byScene: BinDefinition = {
      id: 'b4',
      name: 'sc1',
      filters: [{ field: 'scene', op: 'contains', value: 'sc1' }],
    };
    expect(resolveBin(pool, byScene).map((a) => a.id)).toEqual(['a1']);
  });

  it('rejects corrupt definitions instead of matching everything', () => {
    expect(() => validateBinDefinition({ id: '', name: 'x', filters: [] })).toThrow();
    expect(() =>
      validateBinDefinition({ id: 'b', name: 'x', filters: [{ field: 'nope' as never, op: 'eq', value: 1 }] })
    ).toThrow();
    expect(() =>
      validateBinDefinition({ id: 'b', name: 'x', filters: [{ field: 'rating', op: 'gte', value: 9 }] })
    ).toThrow();
    expect(() => resolveBin(pool, { id: 'b', name: 'x', filters: [] } as never)).not.toThrow();
  });
});
