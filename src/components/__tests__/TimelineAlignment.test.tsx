import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TimelineTrackEditor } from '../TimelineTrackEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { Track } from '../../types/timeline';

function track(id: string, type: Track['type'], index: number, height: number): Track {
  return {
    id,
    type,
    index,
    name: `${type}-${index}`,
    muted: false,
    locked: false,
    solo: false,
    height,
    clips: [],
  };
}

describe('TimelineTrackEditor header/lane alignment', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [
        track('v2', 'video', 1, 72),
        track('v1', 'video', 0, 64),
        track('a1', 'audio', 0, 56),
        track('a2', 'audio', 1, 48),
      ],
      selectedClipIds: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a ruler spacer matching the h-6 timecode ruler', () => {
    render(<TimelineTrackEditor />);
    const spacer = screen.getByTestId('ruler-spacer');
    expect(spacer.className).toContain('h-6');
    expect(spacer.className).toContain('border-b');
  });

  it('keeps every header row exactly as tall as its lane (no vertical drift)', () => {
    const { container } = render(<TimelineTrackEditor />);
    const headers = Array.from(
      container.querySelectorAll('[data-testid^="track-header-"]')
    ) as HTMLElement[];
    const lanes = Array.from(
      container.querySelectorAll('.relative.w-full.border-b')
    ) as HTMLElement[];
    expect(headers.length).toBe(4);
    expect(lanes.length).toBe(4);
    headers.forEach((header, i) => {
      // Same content height per row → rows start at identical offsets given
      // identical box models (h-6 ruler/spacer + border-b separators).
      expect(header.style.height).toBe(lanes[i].style.height);
    });
    expect(headers.map((h) => h.style.height)).toEqual(['72px', '64px', '56px', '48px']);
  });
});
