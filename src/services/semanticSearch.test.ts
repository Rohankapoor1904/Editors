import { describe, it, expect, beforeEach } from 'vitest';
import { SemanticSearchService } from './semanticSearch';
import { setRuntimeMode } from './runtimeConfig';

describe('SemanticSearchService', () => {
  beforeEach(() => {
    setRuntimeMode('live');
  });

  it('throws NotImplementedError in live mode for search', async () => {
    const service = new SemanticSearchService();
    await expect(service.search('test', new Map())).rejects.toThrow('NotImplementedError');
  });

  it('throws NotImplementedError in demo mode for search', async () => {
    setRuntimeMode('demo');
    const service = new SemanticSearchService();
    await expect(service.search('test', new Map())).rejects.toThrow('NotImplementedError');
  });
});
