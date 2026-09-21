import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MultiCamViewer } from '../MultiCamViewer';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { secondsToRational } from '../../types/time';

describe('MultiCamViewer', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    vi.clearAllMocks();

    useTimelineStore.setState({
      tracks: [
        {
          id: 'v1',
          type: 'video',
          index: 0,
          name: 'Video Track 1',
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [
            {
              id: 'clip-1',
              assetId: 'asset_cam_a',
              name: 'Cam A Take 1',
              startOffset: secondsToRational(0),
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(10),
              duration: secondsToRational(10),
            },
          ],
        },
      ],
      playheadPosition: secondsToRational(2.0),
    });

    useMediaPoolStore.setState({
      assets: [
        {
          id: 'asset_1',
          name: 'Host Cam 1',
          path: '/path/host.mp4',
          type: 'video',
          duration: '10s',
          fingerprint: 'fp1',
          isOffline: false,
          resolution: '4K',
        },
        {
          id: 'asset_2',
          name: 'Guest Cam 2',
          path: '/path/guest.mp4',
          type: 'video',
          duration: '10s',
          fingerprint: 'fp2',
          isOffline: false,
          resolution: '1080p',
        },
      ],
    });
  });

  it('renders 4 quad angle monitors with media assets and fallback angles', () => {
    render(<MultiCamViewer />);

    expect(screen.getByText(/Multi-Cam Quad Monitor/i)).toBeInTheDocument();
    expect(screen.getByText('Host Cam 1')).toBeInTheDocument();
    expect(screen.getByText('Guest Cam 2')).toBeInTheDocument();
    expect(screen.getByText(/ANGLE 1/)).toBeInTheDocument();
    expect(screen.getByText(/ANGLE 2/)).toBeInTheDocument();
  });

  it('switches angle when an angle quadrant is clicked', () => {
    render(<MultiCamViewer />);

    const guestAngle = screen.getByText('Guest Cam 2');
    act(() => {
      fireEvent.click(guestAngle);
    });

    // Angle 2 should now have the ON AIR badge
    expect(screen.getByText(/ON AIR/i)).toBeInTheDocument();
  });

  it('triggers audio waveform synchronization on Auto-Sync Audio button click', async () => {
    render(<MultiCamViewer />);

    const syncBtn = screen.getByTitle(/Auto-synchronize angle clips via audio waveform correlation/i);
    await act(async () => {
      fireEvent.click(syncBtn);
    });

    expect(screen.getByText(/Aligned! Audio sync offset:/i)).toBeInTheDocument();
  });

  it('triggers AI auto-cut switching on AI Auto-Cut button click', async () => {
    render(<MultiCamViewer />);

    const autoCutBtn = screen.getByTitle(/AI Active Speaker Auto-Cut Switching/i);
    await act(async () => {
      fireEvent.click(autoCutBtn);
    });

    expect(screen.getByText(/Generated \d+ automated speaker cuts/i)).toBeInTheDocument();
  });
});
