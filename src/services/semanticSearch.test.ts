import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticSearchService } from './semanticSearch';
import { setRuntimeMode } from './runtimeConfig';
import { VlmEmbedding } from '../engine/perception/vlm';

describe('SemanticSearchService (R7.5)', () => {
  beforeEach(() => {
    setRuntimeMode('live');
  });

  it('throws NotImplementedError in demo mode for search', async () => {
    setRuntimeMode('demo');
    const service = new SemanticSearchService();
    await expect(service.search('test', new Map())).rejects.toThrow('NotImplementedError');
  });

  it('Natural-language query returns the expected clips from a labelled fixture set', async () => {
    const service = new SemanticSearchService();

    // Labelled fixture set (using clip IDs as the label for this partial implementation)
    const embeddings = new Map<string, VlmEmbedding>();
    embeddings.set('dog playing in park', { vector: [0, 0, 0], model: 'dummy' });
    embeddings.set('cat sleeping on sofa', { vector: [0, 0, 0], model: 'dummy' });
    embeddings.set('dog running', { vector: [0, 0, 0], model: 'dummy' });

    const results = await service.search('dog park', embeddings);

    expect(results).toHaveLength(2);
    expect(results[0].clipId).toBe('dog playing in park');
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].clipId).toBe('dog running');
  });

  it('returns empty array when query does not match anything', async () => {
    const service = new SemanticSearchService();
    const embeddings = new Map<string, VlmEmbedding>();
    embeddings.set('cat sleeping on sofa', { vector: [0, 0, 0], model: 'dummy' });

    const results = await service.search('bird', embeddings);
    expect(results).toHaveLength(0);
  });
});
