import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticSearchService } from './semanticSearch';
import { setRuntimeMode } from './runtimeConfig';
import { VlmEmbedding } from '../engine/perception/vlm';

describe('SemanticSearchService', () => {
  beforeEach(() => {
    setRuntimeMode('live');
  });

  it('throws NotImplementedError in live mode for search', async () => {
    const service = new SemanticSearchService();
    await expect(service.search('test', new Map())).rejects.toThrow('NotImplementedError');
  });

  it('returns expected clips for natural-language query in demo mode', async () => {
    setRuntimeMode('demo');
    const service = new SemanticSearchService();
    const embeddings = new Map<string, VlmEmbedding>();
    embeddings.set('mock-clip-1', { vector: [0, 0, 0], model: 'clip-mock' });
    const results = await service.search('find the mock clip', embeddings);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].clipId).toBe('mock-clip-1');
  });
});
