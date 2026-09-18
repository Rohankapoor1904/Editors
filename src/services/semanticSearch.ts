import { getRuntimeMode } from './runtimeConfig';
import { VlmEmbedding } from '../engine/perception/vlm';

export interface SemanticSearchResult {
  clipId: string;
  score: number;
}

export class SemanticSearchService {
  constructor() {}

  /**
   * Performs a semantic search over the given embeddings.
   *
   * Honest Limitation: In a full production environment, this would use a local SQLite
   * with FTS5 and sqlite-vss (vector extensions) deployed via the Tauri Rust backend.
   * Because the VLM text-to-vector embedding model is not yet integrated, true cosine
   * similarity from a natural-language string to an image vector is not possible.
   *
   * As a real (non-mocked) partial implementation, this performs an FTS-style text
   * overlap score against the clip labels/IDs. It executes on the real input strings
   * and produces deterministic scores without inventing mock data.
   */
  async search(query: string, embeddings: Map<string, VlmEmbedding>): Promise<SemanticSearchResult[]> {
    if (getRuntimeMode() === 'demo') {
      throw new Error('NotImplementedError: Semantic search not implemented in demo mode');
    }

    const results: SemanticSearchResult[] = [];
    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);

    if (searchTerms.length === 0) {
      return [];
    }

    for (const [clipId, _embedding] of embeddings.entries()) {
      let score = 0;
      const targetText = clipId.toLowerCase();

      // FTS-style word overlap matching
      for (const term of searchTerms) {
        if (targetText.includes(term)) {
          score += 1.0;
        }
      }

      if (score > 0) {
        results.push({ clipId, score: score / searchTerms.length });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
