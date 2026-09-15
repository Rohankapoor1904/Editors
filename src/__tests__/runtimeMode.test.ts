import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRuntimeMode,
  setRuntimeMode,
  isLiveMode,
  isDemoMode,
  NotImplementedError,
} from '../services/runtimeConfig';
import { whisperService } from '../services/whisperTranscriber';
import { sileroVadService } from '../services/sileroVad';
import { nativeBridge } from '../services/nativeBridge';
import { sam2Engine } from '../engine/sam2Masking';
import { exportEngine } from '../engine/exportEngine';

describe('Task R0.3 — Runtime Mode & Stub Fallbacks', () => {
  beforeEach(() => {
    setRuntimeMode('demo');
  });

  it('defaults to demo mode', () => {
    expect(getRuntimeMode()).toBe('demo');
    expect(isDemoMode()).toBe(true);
    expect(isLiveMode()).toBe(false);
  });

  it('toggles to live mode correctly', () => {
    setRuntimeMode('live');
    expect(getRuntimeMode()).toBe('live');
    expect(isLiveMode()).toBe(true);
    expect(isDemoMode()).toBe(false);
  });

  describe('Demo mode behavior (returns stub mock data)', () => {
    it('whisperService returns mock transcript in demo mode', async () => {
      const result = await whisperService.transcribeAudio('dummy.mp4');
      expect(result.words.length).toBeGreaterThan(0);
      expect(result.fullText).toContain('CineCraft AI');
    });

    it('sileroVadService returns mock silence segments in demo mode', async () => {
      const silences = await sileroVadService.detectSilence('dummy.wav');
      expect(silences.length).toBeGreaterThan(0);
      expect(silences[0]).toHaveProperty('startTime');
    });

    it('nativeBridge returns mock probe metadata in demo mode', async () => {
      const metadata = await nativeBridge.importMediaFile();
      expect(metadata).not.toBeNull();
      expect(metadata?.width).toBe(3840);
    });

    it('sam2Engine returns mock subject mask in demo mode', async () => {
      const mask = await sam2Engine.generateSubjectMask(null, { x: 100, y: 100 });
      expect(mask.confidence).toBeGreaterThan(0);
    });

    it('exportEngine renders sequence in demo mode', async () => {
      const success = await exportEngine.renderSequence(
        {
          presetName: 'YouTube 4K',
          width: 3840,
          height: 2160,
          fps: 60,
          bitrateMbps: 50,
          encoder: 'Software x264',
          outputPath: '/tmp/out.mp4',
        },
        () => {}
      );
      expect(success).toBe(true);
    });
  });

  describe('Live mode behavior (throws NotImplementedError on stubbed paths)', () => {
    beforeEach(() => {
      setRuntimeMode('live');
    });

    it('whisperService throws NotImplementedError in live mode', async () => {
      await expect(whisperService.transcribeAudio('dummy.mp4')).rejects.toThrow(
        NotImplementedError
      );
    });

    it('sileroVadService throws NotImplementedError in live mode', async () => {
      await expect(sileroVadService.detectSilence('dummy.wav')).rejects.toThrow(
        NotImplementedError
      );
    });

    it('nativeBridge throws NotImplementedError in live mode', async () => {
      await expect(nativeBridge.importMediaFile()).rejects.toThrow(
        NotImplementedError
      );
      await expect(nativeBridge.demuxVideoFrames('dummy.mp4')).rejects.toThrow(
        NotImplementedError
      );
      await expect(nativeBridge.generateProxy('dummy.mp4')).rejects.toThrow(
        NotImplementedError
      );
    });

    it('sam2Engine throws NotImplementedError in live mode', async () => {
      await expect(
        sam2Engine.generateSubjectMask(null, { x: 100, y: 100 })
      ).rejects.toThrow(NotImplementedError);
      await expect(
        sam2Engine.trackSubjectOverSequence(10, { x: 100, y: 100 })
      ).rejects.toThrow(NotImplementedError);
    });

    it('exportEngine throws NotImplementedError in live mode', async () => {
      await expect(
        exportEngine.renderSequence(
          {
            presetName: 'YouTube 4K',
            width: 3840,
            height: 2160,
            fps: 60,
            bitrateMbps: 50,
            encoder: 'Software x264',
            outputPath: '/tmp/out.mp4',
          },
          () => {}
        )
      ).rejects.toThrow(NotImplementedError);
    });
  });
});
