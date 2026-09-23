import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { ReviewPanel } from '../ReviewPanel';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { createRational } from '../../types/time';

function resetStores() {
  useTimelineStore.setState({
    comments: [],
    markers: [],
    playheadPosition: createRational(60, 30),
    metadata: {
      name: 'Panel Test',
      fps: 30,
      width: 1080,
      height: 1920,
      sampleRate: 48000,
      colorSpace: 'Rec.709',
    },
    tracks: [],
    selectedClipIds: [],
  });
  useMediaPoolStore.setState({ assets: [] });
}

describe('R26.5 — ReviewPanel', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    cleanup();
  });

  it('adds a comment at the playhead, seeks on click, and resolves', () => {
    render(<ReviewPanel />);
    fireEvent.change(screen.getByLabelText('Comment body'), { target: { value: 'Fix color here' } });
    fireEvent.click(screen.getByText('Add'));

    expect(useTimelineStore.getState().comments).toHaveLength(1);
    expect(useTimelineStore.getState().comments[0].body).toBe('Fix color here');
    expect(useTimelineStore.getState().comments[0].time).toEqual({ value: 60, rate: 30 });

    // Seek on click
    act(() => {
      useTimelineStore.getState().setPlayheadPosition(createRational(0, 30));
    });
    fireEvent.click(screen.getByTitle('Seek to comment'));
    expect(useTimelineStore.getState().playheadPosition).toEqual({ value: 60, rate: 30 });

    fireEvent.click(screen.getByTitle('Resolve'));
    expect(useTimelineStore.getState().comments[0].resolved).toBe(true);
  });

  it('rejects vertical master for landscape preset with typed code in UI', () => {
    render(<ReviewPanel />);
    // Master is 1080x1920 (vertical); default preset youtube_4k is 16:9.
    fireEvent.click(screen.getByText('Check'));
    expect(screen.getByText(/\[ASPECT_MISMATCH\]/)).toBeTruthy();
    expect(screen.getByText(/1080x1920/)).toBeTruthy();
  });

  it('passes matching vertical preset', () => {
    render(<ReviewPanel />);
    fireEvent.change(screen.getByLabelText('Publish preset'), { target: { value: 'tiktok_reels' } });
    fireEvent.click(screen.getByText('Check'));
    expect(screen.getByText(/Ready for TikTok/)).toBeTruthy();
  });
});
