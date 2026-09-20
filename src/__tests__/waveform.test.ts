import { describe, it, expect } from 'vitest';
import { getOrCreateWaveformEnvelope, renderWaveformToCanvas } from '../utils/waveform';

describe('Audio Waveform Envelope Generator (Task R13.1)', () => {
  it('generates deterministic, bounded envelope for an asset', () => {
    const env1 = getOrCreateWaveformEnvelope('asset_speech_01', 10, 50);
    const env2 = getOrCreateWaveformEnvelope('asset_speech_01', 10, 50);

    expect(env1.peaks.length).toBe(500); // 10s * 50 samples/s
    expect(env1).toBe(env2); // Cached instance

    // Assert all peak values are strictly within [0.0, 1.0]
    for (let i = 0; i < env1.peaks.length; i++) {
      expect(env1.peaks[i]).toBeGreaterThanOrEqual(0.0);
      expect(env1.peaks[i]).toBeLessThanOrEqual(1.0);
      expect(env1.rms[i]).toBeLessThanOrEqual(env1.peaks[i]);
    }
  });

  it('renders envelope to canvas context without crashing', () => {
    const env = getOrCreateWaveformEnvelope('asset_test_02', 5, 50);

    // Mock canvas 2D context
    const drawCalls: string[] = [];
    const mockCtx = {
      clearRect: () => drawCalls.push('clearRect'),
      fillRect: () => drawCalls.push('fillRect'),
      beginPath: () => drawCalls.push('beginPath'),
      moveTo: () => drawCalls.push('moveTo'),
      lineTo: () => drawCalls.push('lineTo'),
      stroke: () => drawCalls.push('stroke'),
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 1,
      globalAlpha: 1.0,
    } as unknown as CanvasRenderingContext2D;

    renderWaveformToCanvas(mockCtx, env, 400, 60, 0, 5, '#2dd4bf', 0);

    expect(drawCalls).toContain('clearRect');
    expect(drawCalls).toContain('fillRect');
    expect(drawCalls).toContain('stroke');
  });
});
