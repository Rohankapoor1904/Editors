import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listSystemVoices,
  previewVoice,
  startVoiceRecording,
  placeVoiceoverTake,
  renderOfflineTts,
} from './voiceover';
import { useMediaPoolStore } from '../store/mediaPool';

describe('R25.3 — system voices', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns [] honestly where no speech engine exists (this rig)', () => {
    expect(listSystemVoices()).toEqual([]);
    expect(() => previewVoice('Hello')).toThrow(/no system speech engine/);
    expect(() => previewVoice('  ')).toThrow(/non-empty/);
  });

  it('lists and previews through a real speechSynthesis shape when present', () => {
    const speak = vi.fn();
    const voices = [{ voiceURI: 'v1', name: 'Ada', lang: 'en-US', localService: true }];
    vi.stubGlobal('speechSynthesis', undefined);
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => voices, speak },
      writable: true,
      configurable: true,
    });
    class FakeUtterance {
      voiceURI?: string;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      writable: true,
      configurable: true,
    });

    expect(listSystemVoices()).toEqual(voices);
    previewVoice('Hello there', 'v1');
    expect(speak).toHaveBeenCalledTimes(1);
  });
});

describe('R25.3 — microphone recording guards', () => {
  it('names the missing capability instead of a silent no-op', () => {
    expect(() => startVoiceRecording()).toThrow(/microphone unavailable|MediaRecorder unavailable/);
  });

  it('records a take end-to-end against stubbed host APIs', async () => {
    const stopTrack = vi.fn();
    vi.stubGlobal('navigator', undefined);
    Object.defineProperty(window, 'navigator', {
      value: { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } },
      writable: true,
      configurable: true,
    });
    class FakeRecorder {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onerror: ((e: { error: Error }) => void) | null = null;
      state = 'recording';
      stop(): void {
        this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
      }
    }
    Object.defineProperty(window, 'MediaRecorder', {
      value: FakeRecorder,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:vo-take'),
      writable: true,
      configurable: true,
    });

    const controller = startVoiceRecording();
    const take = await controller.stopRecording();
    expect(take.objectUrl).toBe('blob:vo-take');
    expect(take.mimeType).toBe('audio/webm');
    expect(take.durationSec).toBeGreaterThanOrEqual(0);
    expect(take.blob.size).toBeGreaterThan(0);
    expect(stopTrack).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('R25.3 — take placement', () => {
  it('registers a real pool asset with the performed duration', () => {
    useMediaPoolStore.setState({ assets: [] });
    const asset = placeVoiceoverTake(
      { blob: new Blob(['x']), objectUrl: 'blob:vo-1', durationSec: 3.2, mimeType: 'audio/webm' },
      'VO Take 1'
    );
    expect(asset.type).toBe('audio');
    expect(asset.path).toBe('blob:vo-1');
    expect(asset.duration).toBe('00:00:3.2');
    expect(useMediaPoolStore.getState().assets.find((a) => a.id === asset.id)).toBeDefined();

    expect(() =>
      placeVoiceoverTake({ blob: new Blob(['x']), objectUrl: 'blob:vo-2', durationSec: NaN, mimeType: 'audio/webm' }, 'bad')
    ).toThrow();
  });
});

describe('R25.3 — offline TTS honesty', () => {
  it('throws instead of synthesizing without a model', () => {
    expect(() => renderOfflineTts()).toThrow(/no model bundled/);
  });
});
