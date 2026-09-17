import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LimiterEngine } from './limiter';

describe('LimiterEngine', () => {
  let ctx: any;
  let limiter: LimiterEngine;

  beforeEach(() => {
    ctx = {
      createGain: vi.fn(() => ({
        connect: vi.fn()
      })),
      createDynamicsCompressor: vi.fn(() => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 }
      })),
      createDelay: vi.fn(() => ({
        delayTime: { value: 0 },
        connect: vi.fn()
      }))
    };
    limiter = new LimiterEngine();
  });

  it('initializes with brickwall settings and lookahead', () => {
    const nodes = limiter.init(ctx);
    expect(nodes.input).toBeDefined();
    expect(nodes.output).toBeDefined();

    const delay = (limiter as any).lookaheadDelay;
    const compressor = (limiter as any).compressor;

    expect(delay.delayTime.value).toBe(0.001); // 1ms lookahead
    expect(compressor.ratio.value).toBe(20.0); // Brickwall ratio
    expect(compressor.attack.value).toBe(0.001); // Fast attack
    expect(compressor.knee.value).toBe(0.0); // Hard knee

    // Check connection
    expect(delay.connect).toHaveBeenCalledWith(compressor);
  });

  it('reports correct latency for PDC', () => {
    limiter.init(ctx);
    expect(limiter.getLatency()).toBe(0.001);
  });
});
