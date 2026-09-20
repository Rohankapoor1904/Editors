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

  it('pushes downstream clips on 3-point insert edit (R15.1)', () => {
    useMediaPoolStore.setState({ selectedAssetId: 'asset-1' });

    // Pre-populate track with an existing clip starting at 0s, duration 10s
    useTimelineStore.setState({
      playheadPosition: createRational(2, 1), // Playhead at 2s
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
          clips: [
            {
              id: 'existing-clip-1',
              assetId: 'asset-existing',
              name: 'Existing_B_Roll.mp4',
              startOffset: createRational(5, 1),
              sourceIn: createRational(0, 1),
              sourceOut: createRational(5, 1),
              duration: createRational(5, 1)
            }
          ]
        }
      ]
    });

    render(<SourceMonitor />);
    fireEvent.click(screen.getByTitle('Insert (,)'));

    const timeline = useTimelineStore.getState();
    const track = timeline.tracks.find(t => t.id === 'track-v1')!;
    expect(track.clips.length).toBe(2);

    // Inserted clip is placed at playhead (2s) with asset duration (10s)
    const insertedClip = track.clips.find(c => c.assetId === 'asset-1')!;
    expect(insertedClip.startOffset.value / insertedClip.startOffset.rate).toBe(2);
    expect(insertedClip.duration.value / insertedClip.duration.rate).toBe(10);

    // Downstream clip (originally at 5s) was pushed by 10s -> now at 15s
    const downstreamClip = track.clips.find(c => c.id === 'existing-clip-1')!;
    expect(downstreamClip.startOffset.value / downstreamClip.startOffset.rate).toBe(15);
  });

  it('replaces existing media on 3-point overwrite edit without shifting downstream clips (R15.1)', () => {
    useMediaPoolStore.setState({ selectedAssetId: 'asset-1' });

    // Pre-populate track with clip from 0 to 20s
    useTimelineStore.setState({
      playheadPosition: createRational(5, 1), // Playhead at 5s
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
          clips: [
            {
              id: 'long-clip',
              assetId: 'asset-long',
              name: 'Long_Background.mp4',
              startOffset: createRational(0, 1),
              sourceIn: createRational(0, 1),
              sourceOut: createRational(20, 1),
              duration: createRational(20, 1)
            }
          ]
        }
      ]
    });

    render(<SourceMonitor />);
    fireEvent.click(screen.getByTitle('Overwrite (.)'));

    const timeline = useTimelineStore.getState();
    const track = timeline.tracks.find(t => t.id === 'track-v1')!;

    // Overwriting a 10s clip from 5s to 15s splits long-clip into:
    // 1) 0s to 5s (duration 5s)
    // 2) Overwritten clip: 5s to 15s (duration 10s)
    // 3) 15s to 20s (duration 5s)
    expect(track.clips.length).toBe(3);

    const overwrittenClip = track.clips.find(c => c.assetId === 'asset-1')!;
    expect(overwrittenClip.startOffset.value / overwrittenClip.startOffset.rate).toBe(5);
    expect(overwrittenClip.duration.value / overwrittenClip.duration.rate).toBe(10);

    const rightPart = track.clips.find(c => c.id.includes('long-clip_split'))!;
    expect(rightPart.startOffset.value / rightPart.startOffset.rate).toBe(15);
    expect(rightPart.duration.value / rightPart.duration.rate).toBe(5);
  });
});
