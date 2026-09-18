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

  it('throws NotImplementedError in demo mode for encodeFrames', async () => {
    setRuntimeMode('demo');
    const engine = new MultimodalPerceptionEngine();
    await expect(engine.encodeFrames([new Uint8Array(1)])).rejects.toThrow('NotImplementedError');
  });

  it('throws NotImplementedError in demo mode for classifyIntent', async () => {
    setRuntimeMode('demo');
    const engine = new MultimodalPerceptionEngine();
    await expect(engine.classifyIntent([new Uint8Array(1)], 'test')).rejects.toThrow('NotImplementedError');
  });
});
