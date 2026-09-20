import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExportModal } from '../ExportModal';
import { useExportQueueStore } from '../../engine/exportQueue';
import { nativeBridge } from '../../services/nativeBridge';

vi.mock('../../services/nativeBridge', () => ({
  nativeBridge: {
    getAvailableEncoders: vi.fn(),
  },
}));

describe('ExportModal Social Presets & Queue (Tasks R18.1, R18.2, R18.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useExportQueueStore.setState({
      jobs: [],
      isProcessing: false,
    });
    (nativeBridge.getAvailableEncoders as any).mockResolvedValue([
      'Software x264',
      'NVENC (NVIDIA)',
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all social and broadcast presets with LUFS and resolution targets', async () => {
    render(<ExportModal />);

    expect(screen.getByText('YouTube 4K UHD')).toBeDefined();
    expect(screen.getByText('TikTok / Reels / Shorts')).toBeDefined();
    expect(screen.getByText('Broadcast Television (EBU R128)')).toBeDefined();
    expect(screen.getByText('Apple ProRes 422 HQ Master')).toBeDefined();

    expect(screen.getByText('4K 60fps')).toBeDefined();
    expect(screen.getByText('9:16 Vertical')).toBeDefined();
    expect(screen.getByText('EBU -24 LUFS')).toBeDefined();
  });

  it('adds selected preset with calibrated parameters to the render queue', async () => {
    render(<ExportModal />);

    // Select YouTube 4K
    const ytBtn = screen.getByText('YouTube 4K UHD').closest('button')!;
    fireEvent.click(ytBtn);

    // Click Add to Render Queue
    const addQueueBtn = screen.getByText('Add to Render Queue');
    fireEvent.click(addQueueBtn);

    const jobs = useExportQueueStore.getState().jobs;
    expect(jobs.length).toBe(1);
    expect(jobs[0].config.presetName).toBe('YouTube 4K UHD');
    expect(jobs[0].config.width).toBe(3840);
    expect(jobs[0].config.height).toBe(2160);
    expect(jobs[0].config.fps).toBe(59.94);
    expect(jobs[0].config.bitrateMbps).toBe(60);
    expect(jobs[0].config.targetLufs).toBe(-14.0);
    expect(jobs[0].config.colorSpace).toBe('bt709');
  });

  it('renders active render queue with queued job and controls', () => {
    useExportQueueStore.getState().addJob({
      presetName: 'TikTok / Reels / Shorts',
      width: 1080,
      height: 1920,
      fps: 30,
      bitrateMbps: 25,
      encoder: 'NVENC (NVIDIA)',
      outputPath: '/exports/tiktok.mp4',
    });

    render(<ExportModal />);

    expect(screen.getByTestId('export-queue')).toBeDefined();
    expect(screen.getByText(/Render Queue \(1\)/)).toBeDefined();
    expect(screen.getByText('/exports/tiktok.mp4')).toBeDefined();
  });
});
