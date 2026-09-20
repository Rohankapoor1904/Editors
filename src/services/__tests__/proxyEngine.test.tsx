import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nativeBridge } from '../nativeBridge';
import { useMediaPoolStore, MediaAsset } from '../../store/mediaPool';
import { ProgramMonitor } from '../../components/ProgramMonitor';
import { useTimelineStore } from '../../store/timelineStore';
import { secondsToRational } from '../../types/time';

describe('Automatic Background Proxy Generation Engine (Task R14.3)', () => {
  afterEach(() => {
    cleanup();
    delete (window as any).__TAURI_INTERNALS__;
  });

  const testAsset: MediaAsset = {
    id: 'asset_4k_01',
    name: 'RAW_Cinema_Take_4K.mov',
    path: '/media/raw/RAW_Cinema_Take_4K.mov',
    type: 'video',
    duration: '00:00:30',
    resolution: '3840x2160',
    fps: '60',
    fingerprint: 'sha256_fake_4k',
    isOffline: false,
  };

  beforeEach(() => {
    useMediaPoolStore.setState({
      assets: [testAsset],
      selectedAssetId: 'asset_4k_01',
      proxyModeEnabled: false,
    });

    useTimelineStore.setState({
      tracks: [
        {
          id: 'v1',
          type: 'video',
          index: 0,
          name: 'V1',
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [
            {
              id: 'clip_4k_1',
              assetId: 'asset_4k_01',
              name: 'RAW Clip',
              startOffset: secondsToRational(0),
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(30),
              duration: secondsToRational(30),
            },
          ],
        },
      ],
      selectedClipIds: ['clip_4k_1'],
      playheadPosition: secondsToRational(1.0),
    });
  });

  it('invokes native Tauri generate_proxy_video command when Tauri host is present', async () => {
    const mockInvoke = vi.fn().mockResolvedValue('task-proxy-uuid-1234');
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

    const taskId = await nativeBridge.generateProxy('/media/raw/RAW_Cinema_Take_4K.mov', 720, 'h264');

    expect(mockInvoke).toHaveBeenCalledWith('generate_proxy_video', {
      inputPath: '/media/raw/RAW_Cinema_Take_4K.mov',
      targetHeight: 720,
      codec: 'h264',
    });
    expect(taskId).toBe('task-proxy-uuid-1234');
  });

  it('polls background proxy progress via native Tauri poll_proxy_generation', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      taskId: 'task-proxy-uuid-1234',
      status: 'processing',
      percent: 45.0,
      outputPath: '/media/raw/RAW_Cinema_Take_4K.mov.proxy.mp4',
    });
    (window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke };

    const progress = await nativeBridge.pollProxy('task-proxy-uuid-1234');

    expect(mockInvoke).toHaveBeenCalledWith('poll_proxy_generation', {
      taskId: 'task-proxy-uuid-1234',
    });
    expect(progress.percent).toBe(45.0);
    expect(progress.status).toBe('processing');
  });

  it('manages proxy status and toggles proxy playback mode in mediaPoolStore', () => {
    const pool = useMediaPoolStore.getState();
    expect(pool.proxyModeEnabled).toBe(false);

    // Toggle proxy mode
    pool.toggleProxyMode();
    expect(useMediaPoolStore.getState().proxyModeEnabled).toBe(true);

    // Set asset proxy
    pool.setAssetProxy('asset_4k_01', '/media/raw/RAW_Cinema_Take_4K.mov.proxy.mp4', 'ready');
    const updated = useMediaPoolStore.getState().assets.find((a) => a.id === 'asset_4k_01');

    expect(updated?.proxyPath).toBe('/media/raw/RAW_Cinema_Take_4K.mov.proxy.mp4');
    expect(updated?.proxyStatus).toBe('ready');
  });

  it('renders proxy toggle in ProgramMonitor and displays PROXY 720p badge when active', () => {
    render(<ProgramMonitor />);

    const toggleBtn = screen.getByTestId('proxy-mode-toggle');
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.textContent).toContain('Proxy OFF');

    // Turn Proxy ON
    fireEvent.click(toggleBtn);
    expect(toggleBtn.textContent).toContain('Proxy ON');

    // Badge is visible on monitor surface
    const proxyBadge = screen.getByTestId('proxy-badge');
    expect(proxyBadge).toBeDefined();
    expect(proxyBadge.textContent).toContain('PROXY 720p');
  });
});
