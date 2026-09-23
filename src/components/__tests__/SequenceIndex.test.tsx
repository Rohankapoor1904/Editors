import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SequenceIndex } from '../SequenceIndex';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational, rationalToSeconds } from '../../types/time';

function seedTimeline() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64,
        clips: [
          {
            id: 'clip-a', assetId: 'asset-1', name: 'Interview_Take1.mp4',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
          },
          {
            id: 'clip-b', assetId: 'asset-2', name: 'Broll_Mountain.mp4',
            startOffset: createRational(4, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(6, 1),
            duration: createRational(6, 1),
          },
        ],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(0, 1),
    markers: [],
    comments: [],
  });
}

describe('R24.7 — SequenceIndex', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists every clip and seeks exactly on row click', () => {
    seedTimeline();
    render(<SequenceIndex />);
    expect(screen.getByText('Interview_Take1.mp4')).toBeTruthy();
    expect(screen.getByText('Broll_Mountain.mp4')).toBeTruthy();

    fireEvent.click(screen.getByText('Broll_Mountain.mp4'));
    expect(rationalToSeconds(useTimelineStore.getState().playheadPosition)).toBe(4);
    expect(useTimelineStore.getState().selectedClipIds).toEqual(['clip-b']);
  });

  it('filters rows by search query', () => {
    seedTimeline();
    render(<SequenceIndex />);
    fireEvent.change(screen.getByLabelText('Search sequence'), { target: { value: 'broll' } });
    expect(screen.queryByText('Interview_Take1.mp4')).toBeNull();
    expect(screen.getByText('Broll_Mountain.mp4')).toBeTruthy();
  });

  it('adds, seeks and removes markers', () => {
    seedTimeline();
    useTimelineStore.getState().setPlayheadPosition(createRational(7, 1));
    render(<SequenceIndex />);

    fireEvent.change(screen.getByLabelText('New marker name'), { target: { value: 'Intro end' } });
    fireEvent.click(screen.getByTitle('Add marker at playhead'));
    expect(screen.getByText('Intro end')).toBeTruthy();

    // Seek back, then jump via the marker row.
    useTimelineStore.getState().setPlayheadPosition(createRational(0, 1));
    fireEvent.click(screen.getByText('Intro end'));
    expect(rationalToSeconds(useTimelineStore.getState().playheadPosition)).toBe(7);

    fireEvent.click(screen.getByLabelText('Remove marker Intro end'));
    expect(screen.queryByText('Intro end')).toBeNull();
  });
});
