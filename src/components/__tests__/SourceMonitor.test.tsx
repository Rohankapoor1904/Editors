import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SourceMonitor } from '../SourceMonitor';
import { useMediaPoolStore } from '../../store/mediaPool';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational } from '../../types/time';

describe('SourceMonitor (Task R12.1)', () => {
  beforeEach(() => {
    cleanup();
    useMediaPoolStore.setState({
      assets: [
        {
          id: 'asset-1',
          name: 'Interview_A_Roll.mp4',
          path: '/path/to/Interview_A_Roll.mp4',
          duration: '00:00:10',
          type: 'video',
          fingerprint: 'fp-1',
          isOffline: false
        }
      ],
      selectedAssetId: null
    });

    useTimelineStore.setState({
      tracks: [
        {
          id: 'track-v1',
          name: 'V1',
          type: 'video',
          index: 0,
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: []
        }
      ],
      playheadPosition: createRational(0, 60000)
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders empty state when no asset is selected', () => {
    render(<SourceMonitor />);
    expect(screen.getByText('No Asset Selected')).toBeInTheDocument();
  });

  it('renders asset name and controls when asset is selected', () => {
    useMediaPoolStore.setState({ selectedAssetId: 'asset-1' });
    render(<SourceMonitor />);

    expect(screen.getByText('Interview_A_Roll.mp4')).toBeInTheDocument();
    expect(screen.getByTitle('Mark In [I]')).toBeInTheDocument();
    expect(screen.getByTitle('Mark Out [O]')).toBeInTheDocument();
    expect(screen.getByTitle('Insert (,)')).toBeInTheDocument();
    expect(screen.getByTitle('Overwrite (.)')).toBeInTheDocument();
  });

  it('inserts selected clip range into target timeline track', () => {
    useMediaPoolStore.setState({ selectedAssetId: 'asset-1' });
    render(<SourceMonitor />);

    // Click Mark In, then Insert
    fireEvent.click(screen.getByTitle('Mark In [I]'));
    fireEvent.click(screen.getByTitle('Insert (,)'));

    const timeline = useTimelineStore.getState();
    const track = timeline.tracks.find(t => t.id === 'track-v1');
    expect(track?.clips.length).toBe(1);
    expect(track?.clips[0].name).toBe('Interview_A_Roll.mp4');
    expect(track?.clips[0].assetId).toBe('asset-1');
  });
});
