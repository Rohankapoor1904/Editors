import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AutomationLaneEditor } from '../AutomationLane';
import { AutomationLane } from '../../types/timeline';

const LANE: AutomationLane = {
  mode: 'snap',
  points: [
    { timeSec: 10, value: -12 },
    { timeSec: 30, value: 0 },
  ],
};

describe('R26.2 — AutomationLaneEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the curve points and switches modes', () => {
    const onChange = vi.fn();
    render(<AutomationLaneEditor lane={LANE} param="volume" durationSec={60} onChange={onChange} />);
    expect(screen.getByTestId('lane-point-0')).toBeTruthy();
    expect(screen.getByTestId('lane-point-1')).toBeTruthy();
    expect(screen.getByText('2 pts')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Automation mode'), { target: { value: 'latch' } });
    expect(onChange).toHaveBeenCalledWith({ mode: 'latch', points: LANE.points });
  });

  it('adds a point on background double-click', () => {
    const onChange = vi.fn();
    render(<AutomationLaneEditor lane={LANE} param="volume" durationSec={60} onChange={onChange} />);
    const svg = screen.getByTestId('automation-lane').querySelector('svg')!;
    // clientX 150/300 of 60s -> t=30s; clientY 48/96 -> mid-scale = -27 dB.
    fireEvent.doubleClick(svg, { clientX: 150, clientY: 48 });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as AutomationLane;
    expect(next.points).toHaveLength(3);
    expect(next.points.map((p) => p.timeSec)).toEqual([10, 30, 30]);
    // Stable sort keeps the pre-existing 30s point first; the new one lands last.
    expect(next.points[2].value).toBeCloseTo(-27, 6);
  });

  it('drags a point and removes it on double-click', () => {
    const onChange = vi.fn();
    render(<AutomationLaneEditor lane={LANE} param="volume" durationSec={60} onChange={onChange} />);
    const dot = screen.getByTestId('lane-point-0');
    fireEvent.pointerDown(dot, { clientX: 50, clientY: 80, pointerId: 1 });
    const svg = screen.getByTestId('automation-lane').querySelector('svg')!;
    fireEvent.pointerMove(svg, { clientX: 60, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(svg, { pointerId: 1 });
    expect(onChange).toHaveBeenCalled();
    const moved = onChange.mock.calls[0][0] as AutomationLane;
    // x=60/300*60s = 12s; y=80/96 -> k=1-80/96 -> -60+ (16/96)*66 = -49 dB.
    expect(moved.points[0].timeSec).toBeCloseTo(12, 6);
    expect(moved.points[0].value).toBeCloseTo(-49, 6);

    fireEvent.doubleClick(screen.getByTestId('lane-point-1'));
    const removed = onChange.mock.calls[onChange.mock.calls.length - 1][0] as AutomationLane;
    expect(removed.points).toHaveLength(1);
  });

  it('writes through the mixer into the store', async () => {
    const { useTimelineStore } = await import('../../store/timelineStore');
    useTimelineStore.setState({
      tracks: [
        {
          id: 'a1', type: 'audio', index: 0, name: 'A1',
          muted: false, locked: false, solo: false, height: 56, clips: [],
        },
      ],
    });
    const onChange = vi.fn((lane: AutomationLane) => {
      useTimelineStore.getState().setTrackAutomation('a1', 'volume', lane);
    });
    render(<AutomationLaneEditor lane={{ mode: 'snap', points: [] }} param="volume" durationSec={60} onChange={onChange} />);
    const svg = screen.getByTestId('automation-lane').querySelector('svg')!;
    fireEvent.doubleClick(svg, { clientX: 150, clientY: 48 });
    const stored = useTimelineStore.getState().tracks[0].automation?.volume;
    expect(stored?.points).toHaveLength(1);
    expect(stored?.points[0].timeSec).toBe(30);
  });
});
