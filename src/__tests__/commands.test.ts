import { useTimelineStore } from '../store/timelineStore';
import { Clip } from '../types/timeline';
import { secondsToRational } from '../types/time';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Undo/Redo Command Stack (R1.2)', () => {
  beforeEach(() => {
    // Reset store before each test
    useTimelineStore.setState({
      past: [],
      future: [],
      tracks: [
        {
          id: 'test_track_1',
          type: 'video',
          index: 0,
          name: 'V1',
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [],
        }
      ],
      selectedClipIds: [],
    });
  });

  it('applies N commands, undoes N, restoring state, and redo N restores final', () => {
    const store = useTimelineStore.getState();
    const initialState = store.tracks;

    // Command 1: Add a track
    useTimelineStore.getState().addTrack('audio', 'A1');
    const stateAfterCmd1 = useTimelineStore.getState().tracks;
    expect(stateAfterCmd1.length).toBe(2);

    // Command 2: Add a clip to test_track_1
    const testClip: Clip = {
      id: 'test_clip_1',
      assetId: 'asset_1',
      name: 'Test Clip',
      startOffset: secondsToRational(0),
      sourceIn: secondsToRational(0),
      sourceOut: secondsToRational(5),
      duration: secondsToRational(5)
    };
    useTimelineStore.getState().addClipToTrack('test_track_1', testClip);

    const stateAfterCmd2 = useTimelineStore.getState().tracks;
    expect(stateAfterCmd2[0].clips.length).toBe(1);

    // Command 3: Remove clip
    useTimelineStore.getState().removeClip('test_clip_1');
    const stateAfterCmd3 = useTimelineStore.getState().tracks;
    expect(stateAfterCmd3[0].clips.length).toBe(0);

    // Undo 3
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().tracks[0].clips.length).toBe(1);

    // Undo 2
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().tracks[0].clips.length).toBe(0);

    // Undo 1
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().tracks.length).toBe(1);

    // State should equal initial snapshot
    expect(useTimelineStore.getState().tracks).toEqual(initialState);

    // Redo 1
    useTimelineStore.getState().redo();
    expect(useTimelineStore.getState().tracks.length).toBe(2);

    // Redo 2
    useTimelineStore.getState().redo();
    expect(useTimelineStore.getState().tracks[0].clips.length).toBe(1);

    // Redo 3
    useTimelineStore.getState().redo();
    expect(useTimelineStore.getState().tracks).toEqual(stateAfterCmd3);
  });

  it('continuous scrub coalesces into one undo entry', () => {
    useTimelineStore.setState({
      past: [],
      future: []
    });

    // We'll mock a simple slider scrub command that updates zoomLevel just for testing coalesceKey
    class ScrubZoomCommand {
      constructor(public readonly newZoom: number) {}
      coalesceKey = 'scrub_zoom';
      apply(state: any) { return { ...state, zoomLevel: this.newZoom }; }
      invert(state: any) { return state; }
    }

    useTimelineStore.getState().executeCommand(new ScrubZoomCommand(25) as any);
    useTimelineStore.getState().executeCommand(new ScrubZoomCommand(30) as any);
    useTimelineStore.getState().executeCommand(new ScrubZoomCommand(35) as any);

    expect(useTimelineStore.getState().past.length).toBe(1);
    expect(useTimelineStore.getState().zoomLevel).toBe(35);
  });
});
