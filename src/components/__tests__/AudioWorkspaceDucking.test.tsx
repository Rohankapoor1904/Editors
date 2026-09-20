import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioWorkspace } from '../AudioWorkspace';
import { useTimelineStore } from '../../store/timelineStore';
import { audioEngine } from '../../engine/audioEngine';
import { nativeBridge } from '../../services/nativeBridge';
import { secondsToRational } from '../../types/time';

describe('AudioWorkspace Neural Audio Finishing UI (R17.1, R17.2, R17.3)', () => {
  beforeEach(() => {
    // Reset store with a test clip
    useTimelineStore.setState({
      selectedClipIds: ['clip_1'],
      tracks: [
        {
          id: 'track_a1',
          type: 'audio',
          index: 0,
          name: 'A1 - Dialogue Track',
          muted: false,
          locked: false,
          solo: false,
          height: 56,
          clips: [
            {
              id: 'clip_1',
              assetId: '/media/voiceover.wav',
              name: 'Host Voiceover',
              startOffset: secondsToRational(0),
              duration: secondsToRational(10),
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(10),
            },
          ],
        },
      ],
      past: [],
      future: [],
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders sidechain ducking panel with pre-calibrated default values (-30dB threshold, -12dB depth)', () => {
    render(<AudioWorkspace />);

    expect(screen.getByTestId('ducking-panel')).toBeDefined();
    expect(screen.getByText('Automated Sidechain Ducking')).toBeDefined();
    expect(screen.getByText('-30 dB')).toBeDefined();
    expect(screen.getByText('-12 dB')).toBeDefined();

    const toggleBtn = screen.getByTestId('ducking-toggle');
    expect(toggleBtn.textContent).toBe('Enabled');
  });

  it('updates audio engine when ducking parameters are changed', () => {
    const updateSpy = vi.spyOn(audioEngine, 'updateDuckingConfig');

    render(<AudioWorkspace />);

    // Change threshold
    const thresholdInput = screen.getByTestId('ducking-threshold');
    fireEvent.change(thresholdInput, { target: { value: '-25' } });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        threshold: expect.closeTo(Math.pow(10, -25 / 20), 4),
      })
    );

    // Change depth
    const depthInput = screen.getByTestId('ducking-depth');
    fireEvent.change(depthInput, { target: { value: '-15' } });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        duckingGain: expect.closeTo(Math.pow(10, -15 / 20), 4),
      })
    );

    // Toggle ducking
    const toggleBtn = screen.getByTestId('ducking-toggle');
    fireEvent.click(toggleBtn);
    expect(updateSpy).toHaveBeenCalledWith({ enabled: false });
    expect(toggleBtn.textContent).toBe('Bypassed');
  });

  it('renders voice isolation and stem split controls and executes actions on clip', async () => {
    const denoiseSpy = vi.spyOn(nativeBridge, 'denoiseAudioFile').mockResolvedValue({
      outputPath: '/media/isolated.wav',
      snrImprovementDb: 14.2,
    });

    const separateStemsSpy = vi.spyOn(nativeBridge, 'separateAudioStems').mockResolvedValue({
      vocalsPath: '/media/voiceover_vocals.wav',
      instrumentalPath: '/media/voiceover_instrumental.wav',
    });

    render(<AudioWorkspace />);

    expect(screen.getByTestId('voice-isolation-panel')).toBeDefined();
    expect(screen.getByText('Host Voiceover')).toBeDefined();

    // 1-Click isolate dialogue
    const isolateBtn = screen.getByTestId('isolate-voice-btn');
    expect(isolateBtn).toBeDefined();
    fireEvent.click(isolateBtn);

    await waitFor(() => {
      expect(denoiseSpy).toHaveBeenCalledWith('/media/voiceover.wav', 0.75, true);
      expect(screen.getByText(/Measured SNR Improvement: \+14.2 dB/)).toBeDefined();
    });

    // 1-Click separate stems
    const separateBtn = screen.getByTestId('separate-stems-btn');
    expect(separateBtn).toBeDefined();
    fireEvent.click(separateBtn);

    await waitFor(() => {
      expect(separateStemsSpy).toHaveBeenCalledWith('/media/voiceover.wav');
      expect(screen.getByText(/Stem separation complete/)).toBeDefined();
    });
  });
});
