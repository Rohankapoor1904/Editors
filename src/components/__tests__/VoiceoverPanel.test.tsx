import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { VoiceoverPanel } from '../VoiceoverPanel';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { createRational } from '../../types/time';

function seedStores() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64, clips: [],
      },
      {
        id: 'a1', type: 'audio', index: 1, name: 'A1',
        muted: false, locked: false, solo: false, height: 56,
        clips: [
          {
            id: 'clip-vo-1', assetId: 'asset-vo', name: 'VO.wav',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
          },
        ],
      },
    ],
    selectedClipIds: ['clip-vo-1'],
    playheadPosition: createRational(2, 1),
    markers: [],
    comments: [],
  });
  useMediaPoolStore.setState({
    assets: [],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
}

function stubRecordingHost() {
  const stopTrack = vi.fn();
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
      this.ondataavailable?.({ data: new Blob(['take-bytes'], { type: 'audio/webm' }) });
    }
  }
  Object.defineProperty(window, 'MediaRecorder', {
    value: FakeRecorder,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window.URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:vo-panel-take'),
    writable: true,
    configurable: true,
  });
  return stopTrack;
}

describe('R25.3 — VoiceoverPanel', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('states honest availability and fails recording without a mic', () => {
    seedStores();
    render(<VoiceoverPanel />);
    expect(screen.getByText('No system voices on this host.')).toBeTruthy();
    expect(screen.getByText(/Offline neural TTS.*unavailable/)).toBeTruthy();

    fireEvent.click(screen.getByText('Record take'));
    expect(screen.getByText(/Recording failed: voiceover: microphone unavailable/)).toBeTruthy();
  });

  it('records a take, places it on the audio track, and enhances it', async () => {
    seedStores();
    stubRecordingHost();
    const enhanceSpy = vi
      .spyOn(useTimelineStore.getState(), 'applyNoiseIsolation')
      .mockResolvedValue({ outputPath: '/tmp/vo.wav', snrImprovementDb: 13.5 });

    render(<VoiceoverPanel />);
    fireEvent.click(screen.getByText('Record take'));
    expect(screen.getByText('Stop (0.0s)')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText(/Stop \(/));
    });

    const audioClips = useTimelineStore.getState().tracks[1].clips;
    expect(audioClips.length).toBe(2);
    const take = audioClips.find((c) => c.id.startsWith('clip_vo_'))!;
    expect(take.assetId).toMatch(/^vo_/);
    expect(screen.getByText(/Take placed/)).toBeTruthy();

    fireEvent.click(screen.getByText('Isolate voice + level'));
    expect(enhanceSpy).toHaveBeenCalledWith('clip-vo-1', 0.75, true);
    expect(await screen.findByText(/\+13\.5 dB SNR/)).toBeTruthy();
    enhanceSpy.mockRestore();
  });
});
