import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRuntimeMode,
  setRuntimeMode,
  subscribeRuntimeMode,
  isLiveMode,
  isDemoMode,
  NotImplementedError,
} from '../services/runtimeConfig';
import { whisperService } from '../services/whisperTranscriber';
import { sileroVadService } from '../services/sileroVad';
import { nativeBridge } from '../services/nativeBridge';
import { exportEngine } from '../engine/exportEngine';

import { agentOrchestrator } from '../services/agentOrchestrator';
import { useTimelineStore } from '../store/timelineStore';

describe('RuntimeMode & Safe-by-Default Boundary (R0.3)', () => {
  beforeEach(() => {
    // Reset to live mode before each test
    setRuntimeMode('live');
  });

  it('defaults to "live" mode out of the box (Safe-by-Default invariant §5.5)', () => {
    expect(getRuntimeMode()).toBe('live');
    expect(isLiveMode()).toBe(true);
    expect(isDemoMode()).toBe(false);
  });

  describe('In Live Mode (Default): All stubs MUST throw NotImplementedError', () => {
    it('whisperService throws NotImplementedError', async () => {
      await expect(whisperService.transcribe('/path/to/test.wav')).rejects.toThrow(NotImplementedError);
      await expect(whisperService.transcribeAudio('/path/to/test.wav')).rejects.toThrow(NotImplementedError);
    });

    it('sileroVadService throws NotImplementedError', async () => {
      await expect(sileroVadService.detectSilence('/path/to/test.wav')).rejects.toThrow(NotImplementedError);
    });

    it('nativeBridge throws NotImplementedError on probe, demux, and proxy', async () => {
      await expect(nativeBridge.importMediaFile('/path/to/test.mp4')).rejects.toThrow(NotImplementedError);
      await expect(nativeBridge.demuxVideoFrames('/path/to/test.mp4', { value: 0, rate: 60000 }, 10)).rejects.toThrow(NotImplementedError);
      await expect(nativeBridge.generateProxy('/path/to/test.mp4')).rejects.toThrow(NotImplementedError);
    });

    it('exportEngine throws NotImplementedError', async () => {
      await expect(
        exportEngine.exportTimeline(
          {
            presetName: 'YouTube 4K',
            width: 3840,
            height: 2160,
            fps: 60,
            bitrateMbps: 50,
            encoder: 'NVENC (NVIDIA)',
            outputPath: '/out/test.mp4',
          },
          () => {}
        )
      ).rejects.toThrow(NotImplementedError);
    });


    it('agentOrchestrator fails honestly on silence removal without VAD audio in live mode', async () => {
      // R21.3: the fabricated silence gap is gone. With no resolvable audio
      // file, the silence tool reports no_audio and the orchestrator surfaces
      // the failure instead of fake commands.
      useTimelineStore.setState({ past: [], future: [], tracks: [], selectedClipIds: [] });
      await expect(agentOrchestrator.processPrompt('cut silence', () => {})).rejects.toThrow(
        /Tool execution failed/
      );
    });
  });

  describe('In Demo Mode (Opt-in): Stubs return preview mock data', () => {
    beforeEach(() => {
      setRuntimeMode('demo');
    });






    it('nativeBridge returns fallback probe metadata without throwing', async () => {
      const res = await nativeBridge.importMediaFile('/path/to/test.mp4');
      expect(res).not.toBeNull();
      expect(res?.fps).toBe(59.94);
      expect(res?.width).toBe(3840);
    });
  });

  it('notifies subscribers when runtime mode changes', () => {
    let observedMode = getRuntimeMode();
    const unsubscribe = subscribeRuntimeMode((newMode) => {
      observedMode = newMode;
    });

    setRuntimeMode('demo');
    expect(observedMode).toBe('demo');

    setRuntimeMode('live');
    expect(observedMode).toBe('live');

    unsubscribe();
    setRuntimeMode('demo');
    // After unsubscribe, observedMode should not update
    expect(observedMode).toBe('live');
  });
});
