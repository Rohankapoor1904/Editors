import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { TimelineTrackEditor, computeFitZoom } from '../TimelineTrackEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { createRational } from '../../types/time';
import { Track, Clip } from '../../types/timeline';

const POSTER = 'data:image/jpeg;base64,POSTER';

function videoClip(id: string, assetId: string, durationSec: number): Clip {
  const duration = createRational(Math.round(durationSec * 60000), 60000);
  return {
    id,
    assetId,
    name: `${assetId}.mp4`,
    startOffset: createRational(0, 60000),
    sourceIn: createRational(0, 60000),
    sourceOut: duration,
    duration,
  };
}

function track(id: string, type: Track['type'], index: number, clips: Clip[]): Track {
  return {
    id,
    type,
    index,
    name: `${type}${index}`,
    muted: false,
    locked: false,
    solo: false,
    height: 64,
    clips,
  };
}

describe('TimelineTrackEditor viewport (ruler + fit + filmstrip)', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track('v1', 'video', 0, [videoClip('c1', 'a1', 46)])],
      selectedClipIds: [],
      zoomLevel: 20,
    });
    useMediaPoolStore.setState({
      assets: [
        {
          id: 'a1',
          name: 'VID_46s.mp4',
          path: 'blob:web-video',
          type: 'video',
          duration: '00:00:46',
          fingerprint: 'fp1',
          isOffline: false,
          thumbnailUrl: POSTER,
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('sizes the ruler to the content (46s clip → 51 cells, not a fixed 60)', () => {
    render(<TimelineTrackEditor />);
    // 46s content + 5s tail handle = 51s view window.
    expect(screen.getByTestId('time-ruler').children.length).toBe(51);
  });

  it('floors an empty timeline at 30s', () => {
    useTimelineStore.setState({ tracks: [track('v1', 'video', 0, [])] });
    render(<TimelineTrackEditor />);
    expect(screen.getByTestId('time-ruler').children.length).toBe(30);
  });

  it('fit-zoom scales the sequence to the lane viewport', () => {
    render(<TimelineTrackEditor />);
    const scroller = screen.getByTestId('timeline-scroll');
    Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 800 });
    fireEvent.click(screen.getByTestId('fit-zoom'));
    // 800px / 51s = 15.7 → 16 (store clamps 5..200, slider shows 5..100).
    expect(useTimelineStore.getState().zoomLevel).toBe(16);
  });

  it('shows the asset’s real poster in every video clip (no fake boxes)', () => {
    const { container } = render(<TimelineTrackEditor />);
    const strip = screen.getByTestId('filmstrip-a1');
    const imgs = strip.querySelectorAll('img');
    // 46s @ 20px/s = 920px → capped at 8 tiles, all showing the real poster.
    expect(imgs.length).toBe(8);
    imgs.forEach((img) => expect(img.getAttribute('src')).toBe(POSTER));
    void container;
  });

  it('renders no filmstrip at all when the asset has no poster and no playable media', () => {
    useTimelineStore.setState({
      tracks: [track('v1', 'video', 0, [videoClip('c9', 'ghost', 5)])],
    });
    render(<TimelineTrackEditor />);
    expect(screen.queryByTestId('filmstrip-ghost')).toBeNull();
  });

  it('docks the video label to a top bar so the filmstrip owns the full box', () => {
    render(<TimelineTrackEditor />);
    const labelBar = screen.getByTestId('clip-label-c1');
    expect(labelBar.textContent).toContain('a1.mp4');
    expect(labelBar.textContent).toContain('46.0s');
    expect(labelBar.className).toContain('absolute');
    // Filmstrip still spans the clip box underneath the bar.
    expect(screen.getByTestId('filmstrip-a1').querySelectorAll('img').length).toBe(8);
  });

  it('keeps the centered single-row header for audio clips', () => {
    const audioClip: Clip = {
      ...videoClip('a-clip', 'a2', 10),
      name: 'Lofi_Bed.mp3',
    };
    useTimelineStore.setState({
      tracks: [
        track('v1', 'video', 0, [videoClip('c1', 'a1', 46)]),
        { ...track('a1', 'audio', 0, [audioClip]), height: 56 },
      ],
    });
    render(<TimelineTrackEditor />);
    expect(screen.getByText('Lofi_Bed.mp3')).toBeTruthy();
    expect(screen.queryByTestId('clip-label-a-clip')).toBeNull();
  });

  it('wheel over the ruler zooms in on scroll-up and out on scroll-down', () => {
    render(<TimelineTrackEditor />);
    const ruler = screen.getByTestId('time-ruler');
    expect(useTimelineStore.getState().zoomLevel).toBe(20);
    fireEvent.wheel(ruler, { deltaY: -120 });
    const zoomedIn = useTimelineStore.getState().zoomLevel;
    expect(zoomedIn).toBeGreaterThan(20);
    fireEvent.wheel(ruler, { deltaY: 300 });
    expect(useTimelineStore.getState().zoomLevel).toBeLessThan(zoomedIn);
  });

  it('ignores zero-delta wheel events on the ruler', () => {
    render(<TimelineTrackEditor />);
    fireEvent.wheel(screen.getByTestId('time-ruler'), { deltaY: 0 });
    expect(useTimelineStore.getState().zoomLevel).toBe(20);
  });
});

describe('computeFitZoom', () => {
  it('fits content to the viewport within zoom bounds', () => {
    expect(computeFitZoom(800, 51)).toBe(16);
    expect(computeFitZoom(2000, 51)).toBe(39);
    expect(computeFitZoom(100, 51)).toBe(5);
    expect(computeFitZoom(20000, 51)).toBe(100);
  });

  it('returns null when fitting is impossible instead of inventing a zoom', () => {
    expect(computeFitZoom(0, 51)).toBeNull();
    expect(computeFitZoom(-10, 51)).toBeNull();
    expect(computeFitZoom(800, 0)).toBeNull();
    expect(computeFitZoom(NaN, 51)).toBeNull();
    expect(computeFitZoom(800, NaN)).toBeNull();
  });
});

describe('TimelineTrackEditor auto-fit', () => {
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const ownDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [track('v1', 'video', 0, [videoClip('c1', 'a1', 46)])],
      selectedClipIds: [],
      zoomLevel: 20,
    });
    useMediaPoolStore.setState({ assets: [] });
  });

  afterEach(() => {
    cleanup();
    if (ownDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', ownDescriptor);
    } else {
      delete proto.clientWidth;
    }
  });

  function mockViewportWidth(width: number): void {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    });
  }

  it('auto-fits on mount when the viewport is measurable', () => {
    mockViewportWidth(800);
    render(<TimelineTrackEditor />);
    // 46s + 5s tail = 51s → 800/51 = 15.7 → 16.
    expect(useTimelineStore.getState().zoomLevel).toBe(16);
  });

  it('respects a manual zoom when content changes afterwards', () => {
    mockViewportWidth(800);
    render(<TimelineTrackEditor />);
    expect(useTimelineStore.getState().zoomLevel).toBe(16);
    act(() => {
      useTimelineStore.getState().setZoomLevel(40);
    });
    expect(useTimelineStore.getState().zoomLevel).toBe(40);
    // Adding a clip refits only an untouched zoom — 40 must survive.
    act(() => {
      useTimelineStore.setState({
        tracks: [track('v1', 'video', 0, [videoClip('c1', 'a1', 46), videoClip('c2', 'a1', 10)])],
      });
    });
    expect(useTimelineStore.getState().zoomLevel).toBe(40);
  });
});
