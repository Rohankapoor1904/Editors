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


describe('TimelineTrackEditor R9.5 Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window.HTMLElement.prototype.setPointerCapture !== 'function') {
      window.HTMLElement.prototype.setPointerCapture = vi.fn();
      window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    }

    // Reset timeline store clips
    useTimelineStore.setState({
      tracks: [
        { id: 't1', type: 'video', clips: [{ id: 'c1', name: 'Interview_Take1.mp4', startOffset: { value: 0, rate: 1 }, duration: { value: 10, rate: 1 } }] }
      ] as any,
      selectedClipIds: []
    });
  });

  it('adds a new video track when Add Track -> Video is clicked', () => {
    const { getByText, getAllByText } = render(<TimelineTrackEditor />);

    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    // Click "Add Track" dropdown toggle
    fireEvent.click(getAllByText('Add Track')[0]);

    // Click "Video Track"
    fireEvent.click(getByText('Video Track'));

    expect(executeSpy).toHaveBeenCalled();
    const commandArg = executeSpy.mock.calls[0][0];
    expect(commandArg.constructor.name).toBe('AddTrackCommand');
    expect((commandArg as any).newTrack.type).toBe('video');
  });

  it('adds a new audio track when Add Track -> Audio is clicked', () => {
    const { getByText, getAllByText } = render(<TimelineTrackEditor />);

    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    // Click "Add Track" dropdown toggle
    fireEvent.click(getAllByText('Add Track')[0]);

    // Click "Audio Track"
    fireEvent.click(getByText('Audio Track'));

    expect(executeSpy).toHaveBeenCalled();
    const commandArg = executeSpy.mock.calls[0][0];
    expect(commandArg.constructor.name).toBe('AddTrackCommand');
    expect((commandArg as any).newTrack.type).toBe('audio');
  });

  it('dispatches MoveCommand when a clip is dragged in select mode', () => {
    const { getAllByText, queryAllByText } = render(<TimelineTrackEditor />);

    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    // Ensure select tool is active
    fireEvent.click(getAllByText(/Select/i)[0]);

    // Find the first clip text inside the DOM
    const clipTexts = queryAllByText('Interview_Take1.mp4');
    let clipNode = null;
    if (clipTexts.length > 0) {
      clipNode = clipTexts[0].closest('div[style]');
    }

    expect(clipNode).not.toBeNull();

    if (clipNode) {
      fireEvent.pointerDown(clipNode, { clientX: 100 });
      fireEvent.pointerMove(clipNode, { clientX: 150 });
      fireEvent.pointerUp(clipNode, { clientX: 150 });

      expect(executeSpy).toHaveBeenCalled();
      const commandArg = executeSpy.mock.calls.find(call => call[0].constructor.name === 'MoveCommand')?.[0];
      expect(commandArg).toBeDefined();
    }
  });

  it('opens context menu and deletes a clip', () => {
    const { getByText, queryByText, queryAllByText } = render(<TimelineTrackEditor />);

    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    const clipTexts = queryAllByText('Interview_Take1.mp4');
    let clipNode = null;
    if (clipTexts.length > 0) {
      clipNode = clipTexts[0].closest('div[style]');
    }

    expect(clipNode).not.toBeNull();

    if (clipNode) {
      window.HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
        left: 100, top: 0, right: 200, bottom: 64, width: 100, height: 64, x: 100, y: 0, toJSON: () => {}
      }));

      fireEvent.contextMenu(clipNode, { clientX: 110, clientY: 10 });

      // Menu should be visible
      const deleteBtn = getByText('Delete Clip');
      expect(deleteBtn).not.toBeNull();

      fireEvent.click(deleteBtn);

      expect(executeSpy).toHaveBeenCalled();
      const commandArg = executeSpy.mock.calls.find(call => call[0].constructor.name === 'RemoveClipCommand')?.[0];
      expect(commandArg).toBeDefined();

      // Menu should disappear
      expect(queryByText('Delete Clip')).toBeNull();
    }
  });

  it('opens context menu and mutes a clip', () => {
    const { getByText, queryByText, queryAllByText } = render(<TimelineTrackEditor />);

    const timelineStore = useTimelineStore.getState();
    const executeSpy = vi.spyOn(timelineStore, 'executeCommand');

    const clipTexts = queryAllByText('Interview_Take1.mp4');
    let clipNode = null;
    if (clipTexts.length > 0) {
      clipNode = clipTexts[0].closest('div[style]');
    }

    expect(clipNode).not.toBeNull();

    if (clipNode) {
      window.HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
        left: 100, top: 0, right: 200, bottom: 64, width: 100, height: 64, x: 100, y: 0, toJSON: () => {}
      }));

      fireEvent.contextMenu(clipNode, { clientX: 110, clientY: 10 });

      // Menu should be visible
      const muteBtn = getByText('Mute / Unmute');
      expect(muteBtn).not.toBeNull();

      fireEvent.click(muteBtn);

      expect(executeSpy).toHaveBeenCalled();
      const commandArg = executeSpy.mock.calls.find(call => call[0].constructor.name === 'ToggleClipMuteCommand')?.[0];
      expect(commandArg).toBeDefined();

      // Menu should disappear
      expect(queryByText('Mute / Unmute')).toBeNull();
    }
  });
});
