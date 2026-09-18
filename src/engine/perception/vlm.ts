import { getRuntimeMode } from '../../services/runtimeConfig';

export interface VlmEmbedding {
  vector: number[];
  model: string;
}

export interface VisionModelResponse {
  embeddings: VlmEmbedding[];
  intents: string[];
}

export class MultimodalPerceptionEngine {
  constructor() {}

  async encodeFrames(frames: Uint8Array[]): Promise<VlmEmbedding[]> {
    if (getRuntimeMode() === 'live') {
      throw new Error('NotImplementedError: VLM encodeFrames not implemented in live mode');
    }
    return frames.map(() => ({ vector: [0, 0, 0], model: 'clip-mock' }));
  }

  async classifyIntent(_frames: Uint8Array[], _transcript: string): Promise<string[]> {
    if (getRuntimeMode() === 'live') {
      throw new Error('NotImplementedError: VLM classifyIntent not implemented in live mode');
    }
    return ['mock-intent'];
  }
}
