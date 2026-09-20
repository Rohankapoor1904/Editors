import { getRuntimeMode } from './runtimeConfig';
import { VlmEmbedding } from '../engine/perception/vlm';

export interface SemanticSearchResult {
  clipId: string;
  score: number;
}

export class SemanticSearchService {
  constructor() {}

  /**
   * Computes cosine similarity between two normalized vectors:
   * sim(u, v) = (u . v) / (||u|| * ||v||)
   */
  cosineSimilarity(u: number[], v: number[]): number {
    if (u.length === 0 || v.length === 0 || u.length !== v.length) return 0;
    let dot = 0;
    let normU = 0;
    let normV = 0;
    for (let i = 0; i < u.length; i++) {
      dot += u[i] * v[i];
      normU += u[i] * u[i];
      normV += v[i] * v[i];
    }
    const denom = Math.sqrt(normU) * Math.sqrt(normV);
    if (denom < 1e-9) return 0;
    return Math.max(0, Math.min(1, dot / denom));
  }

  /**
   * Performs semantic search over media clips using text token overlap and visual embeddings.
   */
  async search(
    query: string,
    embeddings: Map<string, VlmEmbedding>,
    queryVector?: number[]
  ): Promise<SemanticSearchResult[]> {
    if (getRuntimeMode() === 'demo') {
      throw new Error('NotImplementedError: Semantic search not implemented in demo mode');
    }

    const results: SemanticSearchResult[] = [];
    const searchTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);

    if (searchTerms.length === 0 && !queryVector) {
      return [];
    }

    for (const [clipId, embedding] of embeddings.entries()) {
      let textScore = 0;
      const targetText = clipId.toLowerCase();

      // FTS-style word overlap matching
      if (searchTerms.length > 0) {
        for (const term of searchTerms) {
          if (targetText.includes(term)) {
            textScore += 1.0;
          }
        }
        textScore = textScore / searchTerms.length;
      }

      // Vector cosine similarity if query vector or vector comparison available
      let vectorScore = 0;
      if (queryVector && embedding.vector && embedding.vector.length > 0) {
        vectorScore = this.cosineSimilarity(queryVector, embedding.vector);
      }

      // Blended score
      const finalScore = queryVector && searchTerms.length > 0
        ? textScore * 0.5 + vectorScore * 0.5
        : queryVector
        ? vectorScore
        : textScore;

      if (finalScore > 0) {
        results.push({ clipId, score: finalScore });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
