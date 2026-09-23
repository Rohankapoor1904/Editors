import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TemplateBrowser } from '../TemplateBrowser';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { createRational, rationalToSeconds } from '../../types/time';

vi.mock('../../services/audioAnalyze', () => ({
  fetchAssetBytes: vi.fn(),
  decodeToMono: vi.fn(),
}));

import { decodeToMono } from '../../services/audioAnalyze';

function seedStores() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64,
        clips: [
          {
            id: 'clip-cap-1', assetId: 'asset-v1', name: 'Talk.mp4',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(8, 1),
            duration: createRational(8, 1),
            effects: [
              {
                id: 'cap-1', type: 'caption', enabled: true,
                params: { preset: 'minimal', words: [{ word: 'hi', startTime: 0, endTime: 0.5 }] },
              },
            ],
          },
        ],
      },
      {
        id: 'a1', type: 'audio', index: 1, name: 'A1',
        muted: false, locked: false, solo: false, height: 56,
        clips: [
          {
            id: 'clip-mus-1', assetId: 'asset-m1', name: 'Beat.mp3',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
          },
        ],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(0, 1),
    markers: [],
    comments: [],
    metadata: {
      name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'sRGB',
    },
  });
  useMediaPoolStore.setState({
    assets: [
      {
        id: 'asset-m1', name: 'Beat.mp3', path: 'blob:beat', type: 'audio',
        duration: '00:00:04', fingerprint: 'fpm', isOffline: false,
      },
    ],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
}

/** 120 BPM click track: impulses every 0.5s at 44.1kHz. */
function clickTrack(): { samples: Float32Array; sampleRate: number } {
  const sr = 44100;
  const samples = new Float32Array(sr * 4);
  for (let i = 0; i < samples.length; i += Math.round(sr * 0.5)) {
    for (let j = 0; j < 100 && i + j < samples.length; j++) {
      samples[i + j] = 0.9;
    }
  }
  return { samples, sampleRate: sr };
}

describe('R25.4 — TemplateBrowser', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(decodeToMono).mockReset();
  });

  it('applies canvas, captions and outro from a template', () => {
    seedStores();
    render(<TemplateBrowser />);

    const cards = screen.getAllByText('Apply template');
    fireEvent.click(cards[0]); // Viral Hook (9:16)

    const state = useTimelineStore.getState();
    expect(state.metadata.width).toBe(1080);
    expect(state.metadata.height).toBe(1920);
    const cap = state.tracks[0].clips[0].effects?.find((e) => e.type === 'caption');
    expect((cap?.params as { preset: string }).preset).toBe('hormozi');
    const outro = state.tracks[0].clips.find((c) => c.id.startsWith('tplout_'));
    expect(outro?.title).toBeDefined();
    expect(screen.getByText(/Viral Hook.*1080×1920.*hormozi on 1 clip/)).toBeTruthy();
  });

  it('cuts a music clip on real detected beats', async () => {
    seedStores();
    const { samples, sampleRate } = clickTrack();
    vi.mocked(decodeToMono).mockResolvedValue({ samples, sampleRate });

    render(<TemplateBrowser />);
    fireEvent.change(screen.getByLabelText('Beat source clip'), { target: { value: 'clip-mus-1' } });
    fireEvent.click(screen.getByText('Cut on beats'));

    await waitFor(() => {
      expect(screen.getByText(/Cut on \d+ beats? at/)).toBeTruthy();
    });
    const audioClips = useTimelineStore.getState().tracks[1].clips;
    expect(audioClips.length).toBeGreaterThan(1);
    // Every new boundary sits within half a beat interval (0.25s) of a beat.
    const beats = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5];
    const boundaries = audioClips
      .map((c) => rationalToSeconds(c.startOffset))
      .filter((t) => t > 0);
    expect(boundaries.length).toBeGreaterThan(0);
    for (const b of boundaries) {
      expect(Math.min(...beats.map((beat) => Math.abs(beat - b)))).toBeLessThanOrEqual(0.26);
    }
  });

  it('reports decode failure without splitting', async () => {
    seedStores();
    vi.mocked(decodeToMono).mockRejectedValue(new Error('no WebAudio decoder on this host'));

    render(<TemplateBrowser />);
    fireEvent.change(screen.getByLabelText('Beat source clip'), { target: { value: 'clip-mus-1' } });
    fireEvent.click(screen.getByText('Cut on beats'));

    expect(await screen.findByText(/Beat cuts failed: no WebAudio decoder/)).toBeTruthy();
    expect(useTimelineStore.getState().tracks[1].clips).toHaveLength(1);
  });
});
