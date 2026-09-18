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

  async encodeFrames(_frames: Uint8Array[]): Promise<VlmEmbedding[]> {
    if (getRuntimeMode() === 'live') {
      throw new Error('NotImplementedError: VLM encodeFrames not implemented in live mode');
    }
    throw new Error('NotImplementedError: VLM encodeFrames not implemented in demo mode');
  }

  async classifyIntent(_frames: Uint8Array[], _transcript: string): Promise<string[]> {
    if (getRuntimeMode() === 'live') {
      throw new Error('NotImplementedError: VLM classifyIntent not implemented in live mode');
    }
    throw new Error('NotImplementedError: VLM classifyIntent not implemented in demo mode');
  }
}
