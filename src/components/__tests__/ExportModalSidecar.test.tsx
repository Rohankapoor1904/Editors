import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportModal } from '../ExportModal';
import { useExportQueueStore } from '../../engine/exportQueue';
import { useTimelineStore } from '../../store/timelineStore';
import { nativeBridge } from '../../services/nativeBridge';
import { createRational } from '../../types/time';
import { Clip, Track } from '../../types/timeline';

vi.mock('../../services/nativeBridge', () => ({
  nativeBridge: {
    getAvailableEncoders: vi.fn(),
  },
}));

const captured: { content: string; filename: string } = { content: '', filename: '' };

vi.mock('../../engine/captions/sidecar', async () => {
  const actual = await vi.importActual<typeof import('../../engine/captions/sidecar')>(
    '../../engine/captions/sidecar'
  );
  return {
    ...actual,
    downloadSidecar: vi.fn((content: string, filename: string) => {
      captured.content = content;
      captured.filename = filename;
    }),
  };
});

function captionClip(): Clip {
  return {
    id: 'c1',
    assetId: 'a1',
    name: 'take1',
    startOffset: createRational(0, 60000),
    sourceIn: createRational(0, 60000),
    sourceOut: createRational(10 * 60000, 60000),
    duration: createRational(10 * 60000, 60000),
    effects: [
      {
        id: 'cap',
        type: 'caption',
        enabled: true,
        params: {
          words: [
            { id: 'w1', word: 'Hello', startTime: 0.5, endTime: 0.9 },
            { id: 'w2', word: 'world', startTime: 0.95, endTime: 1.3 },
          ],
        },
      },
    ],
  };
}

function musicBedClip(): Clip {
  return {
    id: 'bed1',
    assetId: 'm1',
    name: 'Music Bed',
    startOffset: createRational(0, 60000),
    sourceIn: createRational(0, 60000),
    sourceOut: createRational(60 * 60000, 60000),
    duration: createRational(60 * 60000, 60000),
    audioRole: 'music',
    speed: 1.0,
  };
}

function trackWith(clips: Clip[], overrides: Partial<Track> = {}): Track {
  return {
    id: 'T1',
    type: 'audio',
    index: 0,
    name: 'A1',
    muted: false,
    locked: false,
    solo: false,
    height: 56,
    clips,
    ...overrides,
  };
}

describe('R25.6 — ExportModal sidecar + music bed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.content = '';
    captured.filename = '';
    useExportQueueStore.setState({ jobs: [], isProcessing: false });
    useTimelineStore.setState({
      tracks: [],
      past: [],
      future: [],
      selectedClipIds: [],
      markers: [],
      comments: [],
      metadata: {
        name: 'My Cut',
        fps: 30,
        width: 1920,
        height: 1080,
        sampleRate: 48000,
        colorSpace: 'Rec.709',
      },
    });
    (nativeBridge.getAvailableEncoders as ReturnType<typeof vi.fn>).mockResolvedValue([
      'Software x264',
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('exports a parseable SRT sidecar from timeline caption words', () => {
    useTimelineStore.setState({ tracks: [trackWith([captionClip()], { type: 'video' })] });
    render(<ExportModal />);

    fireEvent.click(screen.getByTestId('export-sidecar'));

    expect(captured.filename).toBe('My_Cut.srt');
    expect(captured.content).toMatch(/^1\n00:00:00,500 --> 00:00:00,900\nHello\n/);
    expect(captured.content).toContain('world');
    expect(screen.getByTestId('sidecar-status').textContent).toMatch(/Exported 2 word/);
  });

  it('shows an honest error when there are no captions to export', () => {
    render(<ExportModal />);
    fireEvent.click(screen.getByTestId('export-sidecar'));
    expect(screen.getByTestId('sidecar-status').textContent).toMatch(/no caption words/i);
    expect(captured.content).toBe('');
  });

  it('fits a 60s music bed to a 30s target through the real store (acceptance)', () => {
    useTimelineStore.setState({ tracks: [trackWith([musicBedClip()])] });
    render(<ExportModal />);

    fireEvent.change(screen.getByTestId('bed-target'), { target: { value: '30' } });
    fireEvent.click(screen.getByTestId('fit-bed'));

    const clips = useTimelineStore.getState().tracks[0].clips;
    expect(clips).toHaveLength(1);
    const durSec = clips[0].duration.value / clips[0].duration.rate;
    expect(Math.abs(durSec * 30 - 900)).toBeLessThanOrEqual(1); // 30s ±1 frame @30fps
    expect(screen.getByTestId('bed-status').textContent).toMatch(/trim/);
    // Undo stack received the transaction.
    expect(useTimelineStore.getState().past.length).toBeGreaterThan(0);
  });

  it('reports when no music bed exists', () => {
    useTimelineStore.setState({ tracks: [trackWith([captionClip()], { type: 'video' })] });
    render(<ExportModal />);
    fireEvent.click(screen.getByTestId('fit-bed'));
    expect(screen.getByTestId('bed-status').textContent).toMatch(/No music bed/i);
  });
});
