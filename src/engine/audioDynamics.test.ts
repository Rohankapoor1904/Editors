import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebAudioEngineManager } from './audioEngine';
import { useTimelineStore } from '../store/timelineStore';
import { createRational } from '../types/time';

class MockGainNode {
  gain = { setValueAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockCompNode {
  threshold = { value: 0 };
  knee = { value: 0 };
  ratio = { value: 0 };
  attack = { value: 0 };
  release = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain = vi.fn(() => new MockGainNode());
  createStereoPanner = vi.fn(() => ({ pan: { setValueAtTime: vi.fn() }, connect: vi.fn() }));
  createAnalyser = vi.fn(() => ({ fftSize: 256, getFloatTimeDomainData: vi.fn(), connect: vi.fn() }));
  createBiquadFilter = vi.fn(() => ({ type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect: vi.fn() }));
  createDynamicsCompressor = vi.fn(() => new MockCompNode());
  createDelay = vi.fn(() => ({ delayTime: { value: 0 }, connect: vi.fn() }));
}

function seedClip(entry: Record<string, unknown> | null) {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'track-a1',
        type: 'audio',
        index: 2,
        name: 'A1',
        muted: false,
        locked: false,
        solo: false,
        height: 56,
        clips: [
          {
            id: 'clip-dyn-1',
            assetId: 'asset-1',
            name: 'VO.wav',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
            audioEffects: entry
              ? [{ id: 'dyn_comp', type: 'dynamics_compressor', enabled: true, params: entry }]
              : [],
          },
        ],
      },
    ],
    selectedClipIds: [],
  });
}

describe('R24.3 remainder — live per-clip compressor insertion', () => {
  let engine: WebAudioEngineManager;
  let ctx: MockAudioContext;

  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      AudioContext: MockAudioContext,
      setInterval: vi.fn(),
      clearInterval: vi.fn(),
    };
    engine = new WebAudioEngineManager();
    engine.init(48000);
    ctx = (engine as unknown as { ctx: MockAudioContext }).ctx;
  });

  it('splices a compressor with the stored params and reuses the node', () => {
    // init() already builds one compressor for the master limiter: count
    // relative to that baseline instead of assuming a fresh context.
    const baseline = ctx.createDynamicsCompressor.mock.calls.length;
    seedClip({ thresholdDb: -12, ratio: 4, attackMs: 5, releaseMs: 100, kneeDb: 3 });
    const cfg = engine.applyClipDynamics('clip-dyn-1');
    expect(cfg).toEqual({ threshold: -12, knee: 3, ratio: 4, attack: 0.005, release: 0.1 });
    expect(ctx.createDynamicsCompressor.mock.calls.length).toBe(baseline + 1);

    const again = engine.applyClipDynamics('clip-dyn-1');
    expect(again).toEqual(cfg);
    expect(ctx.createDynamicsCompressor.mock.calls.length).toBe(baseline + 1);
  });

  it('removes the node and restores the direct path when the entry is gone', () => {
    seedClip({ thresholdDb: -12, ratio: 4, attackMs: 5, releaseMs: 100 });
    expect(engine.applyClipDynamics('clip-dyn-1')).not.toBeNull();

    seedClip(null);
    expect(engine.applyClipDynamics('clip-dyn-1')).toBeNull();
    // Second call with no node present stays null and quiet.
    expect(engine.applyClipDynamics('clip-dyn-1')).toBeNull();
  });

  it('returns null uninitialized and throws on invalid stored params', () => {
    const cold = new WebAudioEngineManager();
    seedClip({ thresholdDb: -12, ratio: 4, attackMs: 5, releaseMs: 100 });
    expect(cold.applyClipDynamics('clip-dyn-1')).toBeNull();
    expect(engine.applyClipDynamics('ghost-clip')).toBeNull();

    seedClip({ thresholdDb: -12, ratio: 0.5, attackMs: 5, releaseMs: 100 });
    expect(() => engine.applyClipDynamics('clip-dyn-1')).toThrow();
  });
});
