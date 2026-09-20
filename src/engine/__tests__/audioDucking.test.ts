import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioGraph, DuckingConfig } from '../audioGraph';

describe('Automated Dynamic Sidechain Ducking (R17.2)', () => {
  let mockCtx: AudioContext;
  let mockCurrentTime = 10.0;

  beforeEach(() => {
    mockCurrentTime = 10.0;
    mockCtx = {
      currentTime: mockCurrentTime,
      destination: {},
      createGain: () => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: {
          value: 1.0,
          cancelScheduledValues: vi.fn(),
          setTargetAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      }),
      createAnalyser: () => {
        let fakeData: Float32Array | null = null;
        return {
          connect: vi.fn(),
          disconnect: vi.fn(),
          fftSize: 2048,
          smoothingTimeConstant: 0.8,
          getFloatTimeDomainData: vi.fn((buf: Float32Array) => {
            if (fakeData) {
              buf.set(fakeData);
            } else {
              buf.fill(0);
            }
          }),
          // helper to set simulated speech
          _setSignal: (data: Float32Array) => {
            fakeData = data;
          },
        };
      },
    } as unknown as AudioContext;
  });

  it('configures ducking with exact Roadmap specs: threshold -30dB, attenuation -12dB, attack 50ms, release 300ms', () => {
    const graph = new AudioGraph(mockCtx);
    graph.createBus('dialogue');
    graph.createBus('music');

    const thresholdLinear = Math.pow(10, -30 / 20); // ~0.03162
    const duckingGainLinear = Math.pow(10, -12 / 20); // ~0.25119

    const config: DuckingConfig = {
      sourceBus: 'dialogue',
      targetBus: 'music',
      threshold: thresholdLinear,
      duckingGain: duckingGainLinear,
      attack: 0.05,  // 50ms
      release: 0.30, // 300ms
      enabled: true,
    };

    graph.addDucking(config);

    const retrieved = graph.getDuckingConfig('dialogue', 'music');
    expect(retrieved).toBeDefined();
    expect(retrieved?.threshold).toBeCloseTo(0.03162, 4);
    expect(retrieved?.duckingGain).toBeCloseTo(0.25119, 4);
    expect(retrieved?.attack).toBe(0.05);
    expect(retrieved?.release).toBe(0.30);
  });

  it('triggers sidechain gain ducking when speech exceeds -30dB RMS', () => {
    const graph = new AudioGraph(mockCtx);
    const dialogueBus = graph.createBus('dialogue');
    const musicBus = graph.createBus('music');

    const thresholdLinear = Math.pow(10, -30 / 20); // ~0.03162
    const duckingGainLinear = Math.pow(10, -12 / 20); // ~0.25119

    graph.addDucking({
      sourceBus: 'dialogue',
      targetBus: 'music',
      threshold: thresholdLinear,
      duckingGain: duckingGainLinear,
      attack: 0.05,
      release: 0.30,
      enabled: true,
    });

    // 1. Initially silent speech
    graph.processDucking();
    expect(graph.isDuckingActive('dialogue', 'music')).toBe(false);

    // 2. Simulate speech exceeding -30dB (e.g. amplitude 0.20 -> RMS ~0.14 > 0.03162)
    const speechData = new Float32Array(2048).fill(0.20);
    (dialogueBus.analyser as any)._setSignal(speechData);

    graph.processDucking();

    expect(graph.isDuckingActive('dialogue', 'music')).toBe(true);
    expect(musicBus.sidechainGain.gain.cancelScheduledValues).toHaveBeenCalledWith(mockCurrentTime);
    expect(musicBus.sidechainGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      duckingGainLinear,
      mockCurrentTime,
      0.05
    );

    // 3. Simulate speech stopping (silence)
    const silenceData = new Float32Array(2048).fill(0.0);
    (dialogueBus.analyser as any)._setSignal(silenceData);

    graph.processDucking();

    expect(graph.isDuckingActive('dialogue', 'music')).toBe(false);
    expect(musicBus.sidechainGain.gain.setTargetAtTime).toHaveBeenCalledWith(
      1.0,
      mockCurrentTime,
      0.30
    );
  });

  it('allows dynamic parameter updates and disabling ducking', () => {
    const graph = new AudioGraph(mockCtx);
    graph.createBus('dialogue');
    const musicBus = graph.createBus('music');

    graph.addDucking({
      sourceBus: 'dialogue',
      targetBus: 'music',
      threshold: 0.03162,
      duckingGain: 0.25119,
      attack: 0.05,
      release: 0.30,
      enabled: true,
    });

    // Update threshold and depth
    graph.updateDucking('dialogue', 'music', {
      threshold: 0.05,
      duckingGain: 0.15,
    });

    const updated = graph.getDuckingConfig('dialogue', 'music');
    expect(updated?.threshold).toBe(0.05);
    expect(updated?.duckingGain).toBe(0.15);

    // Disable ducking
    graph.updateDucking('dialogue', 'music', { enabled: false });
    expect(updated?.enabled).toBe(false);
    expect(musicBus.sidechainGain.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, mockCurrentTime, 0.05);
  });
});
