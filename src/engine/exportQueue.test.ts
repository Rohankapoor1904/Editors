import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useExportQueueStore } from './exportQueue';
import { exportEngine, ExportPresetConfig } from './exportEngine';

// Mock the export engine so we don't actually trigger the hardware renderer
vi.mock('./exportEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./exportEngine')>();
  return {
    ...actual,
    exportEngine: {
      ...actual.exportEngine,
      renderSequence: vi.fn(),
    },
  };
});

describe('ExportQueue R8.3', () => {
  beforeEach(() => {
    // Reset the Zustand store state before each test
    useExportQueueStore.setState({
      jobs: [],
      isProcessing: false,
    });
    vi.clearAllMocks();
  });

  it('queues and processes multiple jobs in order', async () => {
    // Given 3 jobs
    const config1: ExportPresetConfig = { presetName: 'YouTube 4K', width: 3840, height: 2160, fps: 60, bitrateMbps: 50, encoder: 'Software x264', outputPath: '/out1.mp4' };
    const config2: ExportPresetConfig = { presetName: 'TikTok / Reels (1080x1920)', width: 1080, height: 1920, fps: 60, bitrateMbps: 25, encoder: 'Software x264', outputPath: '/out2.mp4' };
    const config3: ExportPresetConfig = { presetName: 'ProRes 422 HQ', width: 3840, height: 2160, fps: 24, bitrateMbps: 220, encoder: 'Software x264', outputPath: '/out3.mp4' };

    // Set up our mock to resolve instantly and simulate progress
    const mockRenderSequence = vi.mocked(exportEngine.renderSequence);
    mockRenderSequence.mockImplementation(async (_config, onProgress) => {
      onProgress(50);
      onProgress(100);
      return Promise.resolve(true);
    });

    const store = useExportQueueStore.getState();

    // Add all 3 jobs
    store.addJob(config1);
    store.addJob(config2);
    store.addJob(config3);

    // Initial state after synchronous adding
    let jobs = useExportQueueStore.getState().jobs;
    expect(jobs.length).toBe(3);

    // Wait for the async queue loop to settle
    await vi.waitFor(
      () => {
        const state = useExportQueueStore.getState();
        expect(state.jobs.every((job) => job.status === 'done')).toBe(true);
      },
      { timeout: 1000 }
    );

    jobs = useExportQueueStore.getState().jobs;

    // Verify all finished correctly
    expect(jobs[0].status).toBe('done');
    expect(jobs[1].status).toBe('done');
    expect(jobs[2].status).toBe('done');

    // Verify they were called in correct order
    expect(mockRenderSequence).toHaveBeenCalledTimes(3);
    expect(mockRenderSequence.mock.calls[0][0].outputPath).toBe('/out1.mp4');
    expect(mockRenderSequence.mock.calls[1][0].outputPath).toBe('/out2.mp4');
    expect(mockRenderSequence.mock.calls[2][0].outputPath).toBe('/out3.mp4');
  });

  it('handles failed jobs and continues processing the queue', async () => {
    const config1: ExportPresetConfig = { presetName: 'YouTube 4K', width: 3840, height: 2160, fps: 60, bitrateMbps: 50, encoder: 'Software x264', outputPath: '/out1.mp4' };
    const config2: ExportPresetConfig = { presetName: 'TikTok / Reels (1080x1920)', width: 1080, height: 1920, fps: 60, bitrateMbps: 25, encoder: 'Software x264', outputPath: '/out2.mp4' };

    const mockRenderSequence = vi.mocked(exportEngine.renderSequence);
    mockRenderSequence
      .mockRejectedValueOnce(new Error('GPU Out of Memory')) // First fails
      .mockResolvedValueOnce(true); // Second succeeds

    useExportQueueStore.getState().addJob(config1);
    useExportQueueStore.getState().addJob(config2);

    await vi.waitFor(
      () => {
        const state = useExportQueueStore.getState();
        expect(state.jobs[0].status).toBe('failed');
        expect(state.jobs[1].status).toBe('done');
      },
      { timeout: 1000 }
    );

    const jobs = useExportQueueStore.getState().jobs;
    expect(jobs[0].error).toBe('GPU Out of Memory');
    expect(jobs[1].error).toBeUndefined();
  });
});
