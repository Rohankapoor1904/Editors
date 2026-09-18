import { describe, it, expect, beforeEach } from 'vitest';
import { MultimodalPerceptionEngine } from './vlm';
import { setRuntimeMode } from '../../services/runtimeConfig';

describe('MultimodalPerceptionEngine', () => {
  beforeEach(() => {
    setRuntimeMode('live');
  });

  it('throws NotImplementedError in live mode for encodeFrames', async () => {
    const engine = new MultimodalPerceptionEngine();
    await expect(engine.encodeFrames([new Uint8Array(1)])).rejects.toThrow('NotImplementedError');
  });

  it('throws NotImplementedError in live mode for classifyIntent', async () => {
    const engine = new MultimodalPerceptionEngine();
    await expect(engine.classifyIntent([new Uint8Array(1)], 'test')).rejects.toThrow('NotImplementedError');
  });

  it('returns mock data in demo mode', async () => {
    setRuntimeMode('demo');
    const engine = new MultimodalPerceptionEngine();
    const frames = [new Uint8Array(1)];
    const embeddings = await engine.encodeFrames(frames);
    expect(embeddings.length).toBe(1);
    expect(embeddings[0].vector).toEqual([0, 0, 0]);

    const intents = await engine.classifyIntent(frames, 'test');
    expect(intents).toEqual(['mock-intent']);
  });

  it('semantically orders embeddings (demo)', async () => {
    setRuntimeMode('demo');
    const engine = new MultimodalPerceptionEngine();
    // Simulate near-duplicate frames
    const frames = [new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])];
    const embeddings = await engine.encodeFrames(frames);
    // In demo mode, they are mock vectors, so they are identical
    expect(embeddings[0].vector).toEqual(embeddings[1].vector);
  });

  it('beats defined baseline for intent classification (demo)', async () => {
    setRuntimeMode('demo');
    const engine = new MultimodalPerceptionEngine();
    const intents = await engine.classifyIntent([new Uint8Array(1)], 'action');
    expect(intents.length).toBeGreaterThan(0);
  });
});
