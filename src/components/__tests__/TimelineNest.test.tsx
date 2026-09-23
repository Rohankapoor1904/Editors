import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { TimelineTrackEditor } from '../TimelineTrackEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational, rationalToSeconds } from '../../types/time';

function seedTwoClips() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64,
        clips: [
          {
            id: 'c1', assetId: 'asset-1', name: 'A.mp4',
            startOffset: createRational(2, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
          },
          {
            id: 'c2', assetId: 'asset-1', name: 'B.mp4',
            startOffset: createRational(6, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
          },
        ],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(2, 1),
    markers: [],
    comments: [],
  });
}

function clips() {
  return useTimelineStore.getState().tracks[0].clips;
}

describe('R26.1 — Nest / open / unnest in the timeline', () => {
  afterEach(() => {
    cleanup();
  });

  it('nests selected clips, opens at the kept playhead, and unnests back', () => {
    seedTwoClips();
    render(<TimelineTrackEditor />);

    // Nest needs 2+ selected clips: button disabled until then.
    // Selection happens outside React events: wrap in act() so the
    // toolbar re-renders before clicking (stale-button trap).
    expect(screen.getByText('Nest').closest('button') as HTMLButtonElement).toHaveProperty('disabled', true);
    act(() => {
      useTimelineStore.getState().selectClip('c1');
      useTimelineStore.getState().selectClip('c2', true);
    });
    fireEvent.click(screen.getByText('Nest'));

    expect(clips()).toHaveLength(1);
    expect(clips()[0].compound?.clips.map((c) => c.id)).toEqual(['c1', 'c2']);

    // Double-click opens the compound; the playhead never moves.
    fireEvent.doubleClick(screen.getByTitle('Double-click to open compound (playhead kept)'));
    expect(screen.getByText(/playhead kept/)).toBeTruthy();
    expect(rationalToSeconds(useTimelineStore.getState().playheadPosition)).toBe(2);

    fireEvent.click(screen.getByText('Unnest to edit'));
    expect(clips().map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(rationalToSeconds(clips()[1].startOffset)).toBe(6);
  });

  it('adds an adjustment layer at the playhead', () => {
    seedTwoClips();
    render(<TimelineTrackEditor />);
    fireEvent.click(screen.getByText('+ Adjustment'));
    const adj = clips().find((c) => c.adjustment);
    expect(adj).toBeDefined();
    expect(rationalToSeconds(adj!.startOffset)).toBe(2);
    expect(rationalToSeconds(adj!.duration)).toBe(5);
  });
});
