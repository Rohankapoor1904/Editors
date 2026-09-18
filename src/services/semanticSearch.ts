import { getRuntimeMode } from './runtimeConfig';
import { VlmEmbedding } from '../engine/perception/vlm';

export interface SemanticSearchResult {
  clipId: string;
  score: number;
}

export class SemanticSearchService {
  constructor() {}

  async search(_query: string, _embeddings: Map<string, VlmEmbedding>): Promise<SemanticSearchResult[]> {
    if (getRuntimeMode() === 'live') {
      throw new Error('NotImplementedError: Semantic search not implemented in live mode');
    }
    throw new Error('NotImplementedError: Semantic search not implemented in demo mode');
  }
}
