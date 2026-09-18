import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { TimelineTrackEditor } from '../TimelineTrackEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { rationalToSeconds } from '../../types/time';

describe('TimelineTrackEditor Drag and Drop', () => {
  beforeEach(() => {
    // Reset state before tests if needed
    vi.clearAllMocks();
  });

  it('adds a clip to the track when an asset is dropped on it', () => {
    // Setup media pool with a test asset
    useMediaPoolStore.setState({
      assets: [{
        id: 'asset_drop_test',
        name: 'drop_test.mp4',
        path: 'blob:video',
        type: 'video',
        duration: '00:00:20',
        fingerprint: '321',
        isOffline: false
      }]
    });

    render(<TimelineTrackEditor />);

    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    // Find the video track element (track_v1 or track_v2)
    // The tracks map iterates and creates a div with height style and track contents
    // Let's grab track_v1 (the 2nd track in default state)
    // We can find it by looking for the element with the dragOver handler that contains the track clips.
    // However, testing-library might not easily find it by default roles if it's just a div.
    // Let's use a container query or text content if we can, but the drop target is a sibling to the left header.
    // The easiest way is to query by test id, but since we didn't add one, we can find it via container.
    // A relative w-full border-b border-neutral-900/60 div is the drop target.

    // There are 4 tracks by default in initial state (v2, v1, a1, a2)
    const trackDropTargets = document.querySelectorAll('.relative.w-full.border-b.border-neutral-900\\/60');
    expect(trackDropTargets.length).toBe(4);

    // Drop on the first video track (v2)
    const v2TrackTarget = trackDropTargets[0];

    // Mock the drop event dataTransfer
    const mockDataTransfer = {
      getData: vi.fn().mockReturnValue('asset_drop_test')
    };

    // The X coordinate dictates time. dropX = clientX - rect.left
    // clientX defaults to 0 in fireEvent unless specified, let's just trigger it.
    // We have to mock getBoundingClientRect on the prototype because testing-library fireEvent creates a synthetic event where currentTarget is evaluated
    window.HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 0,
      right: 1000,
      bottom: 64,
      width: 900,
      height: 64,
      x: 100,
      y: 0,
      toJSON: () => {}
    }));

    fireEvent.drop(v2TrackTarget, {
      clientX: 500, // 400px from left. zoomLevel is 20, so 400/20 = 20s
      dataTransfer: mockDataTransfer
    });

    expect(executeSpy).toHaveBeenCalled();
    const commandArg = executeSpy.mock.calls[0][0];
    expect((commandArg as any).trackId).toBe('track_v2'); // The first track is v2
    expect((commandArg as any).clip.assetId).toBe('asset_drop_test');
    // test environment clientX is 0, rect.left is 100, dropX = -100. Math.max(0, dropX) => 0
    expect(rationalToSeconds((commandArg as any).clip.startOffset)).toBe(0);
  });
});
