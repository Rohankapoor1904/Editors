import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CurveEditor } from '../CurveEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { secondsToRational } from '../../types/time';
import { Clip } from '../../types/timeline';
import { parseCubicBezier, formatCubicBezier, sampleCubicBezierCurve } from '../../utils/keyframing';
import { SetKeyframeCommand, RemoveKeyframeCommand } from '../../core/commands/edits';

describe('Visual Keyframe Bezier Curve Editor (Task R14.1)', () => {
  afterEach(() => {
    cleanup();
  });

  const testClip: Clip = {
    id: 'clip-1',
    assetId: 'asset-1',
    name: 'Interview Video',
    startOffset: secondsToRational(0),
    sourceIn: secondsToRational(0),
    sourceOut: secondsToRational(10),
    duration: secondsToRational(10),
    keyframes: {
      opacity: [
        { time: secondsToRational(0), value: 0, easing: 'linear' },
        { time: secondsToRational(5), value: 1, easing: 'ease-in-out' },
      ],
    },
  };

  beforeEach(() => {
    useTimelineStore.setState({
      past: [],
      future: [],
      tracks: [
        {
          id: 'track-v1',
          type: 'video',
          index: 0,
          name: 'V1',
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [JSON.parse(JSON.stringify(testClip))],
        },
      ],
      selectedClipIds: ['clip-1'],
      playheadPosition: secondsToRational(2.5),
    });
  });

  it('renders property selector buttons and active curve canvas', () => {
    render(<CurveEditor clipId="clip-1" />);

    expect(screen.getByText('Position X')).toBeDefined();
    expect(screen.getByText('Position Y')).toBeDefined();
    expect(screen.getByText('Scale X')).toBeDefined();
    expect(screen.getByText('Rotation')).toBeDefined();
    expect(screen.getByText('Opacity')).toBeDefined();
    expect(screen.getByText('Volume')).toBeDefined();
  });

  it('allows switching active animatable property', () => {
    render(<CurveEditor clipId="clip-1" />);

    const rotationBtn = screen.getByText('Rotation');
    fireEvent.click(rotationBtn);

    // Rotation is now active property button
    expect(rotationBtn.closest('button')?.className).toContain('bg-indigo-accent');
    expect(screen.getByText('360°')).toBeDefined();
  });

  it('adds a new keyframe at the playhead position via UI button', () => {
    render(<CurveEditor clipId="clip-1" />);

    // Initial keyframes count for opacity is 2
    const clipBefore = useTimelineStore.getState().tracks[0].clips[0];
    expect(clipBefore.keyframes?.opacity?.length).toBe(2);

    const addKeyBtn = screen.getByText('Add Key');
    fireEvent.click(addKeyBtn);

    const clipAfter = useTimelineStore.getState().tracks[0].clips[0];
    expect(clipAfter.keyframes?.opacity?.length).toBe(3);
    // Keyframe inserted at playhead time (2.5s)
    const insertedKf = clipAfter.keyframes?.opacity?.find(
      (k) => Math.abs(k.time.value / k.time.rate - 2.5) < 0.01
    );
    expect(insertedKf).toBeDefined();
  });

  it('applies easing presets to a keyframe in the store', () => {
    render(<CurveEditor clipId="clip-1" />);

    // Click on the first keyframe node to select it
    const kfNodes = screen.getAllByTestId('keyframe-node');
    expect(kfNodes.length).toBeGreaterThanOrEqual(2);
    fireEvent.mouseDown(kfNodes[0]);

    // Apply "ease-out" preset
    const easeOutBtn = screen.getByText('ease-out');
    fireEvent.click(easeOutBtn);

    const clip = useTimelineStore.getState().tracks[0].clips[0];
    expect(clip.keyframes?.opacity?.[0].easing).toBe('ease-out');
  });

  it('deletes selected keyframe via UI button', () => {
    render(<CurveEditor clipId="clip-1" />);

    const kfNodes = screen.getAllByTestId('keyframe-node');
    fireEvent.mouseDown(kfNodes[1]); // select second keyframe

    const deleteBtn = screen.getByTitle('Delete selected keyframe');
    fireEvent.click(deleteBtn);

    const clip = useTimelineStore.getState().tracks[0].clips[0];
    expect(clip.keyframes?.opacity?.length).toBe(1);
  });

  it('supports undo and redo for keyframe additions and edits', () => {
    const store = useTimelineStore.getState();

    // Command 1: Add keyframe
    const newKf = { time: secondsToRational(7), value: 0.5, easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)' };
    store.executeCommand(new SetKeyframeCommand('clip-1', 'opacity', newKf));

    expect(useTimelineStore.getState().tracks[0].clips[0].keyframes?.opacity?.length).toBe(3);

    // Undo
    store.undo();
    expect(useTimelineStore.getState().tracks[0].clips[0].keyframes?.opacity?.length).toBe(2);

    // Redo
    store.redo();
    expect(useTimelineStore.getState().tracks[0].clips[0].keyframes?.opacity?.length).toBe(3);

    // Command 2: Remove keyframe
    store.executeCommand(new RemoveKeyframeCommand('clip-1', 'opacity', secondsToRational(7)));
    expect(useTimelineStore.getState().tracks[0].clips[0].keyframes?.opacity?.length).toBe(2);

    // Undo removal
    store.undo();
    expect(useTimelineStore.getState().tracks[0].clips[0].keyframes?.opacity?.length).toBe(3);
  });

  describe('Bezier Math Utilities (parse, format, sample)', () => {
    it('parses preset names and custom cubic-bezier strings', () => {
      expect(parseCubicBezier('linear')).toEqual([0, 0, 1, 1]);
      expect(parseCubicBezier('ease-in')).toEqual([0.42, 0, 1, 1]);
      expect(parseCubicBezier('ease-out')).toEqual([0, 0, 0.58, 1]);
      expect(parseCubicBezier('ease-in-out')).toEqual([0.42, 0, 0.58, 1]);

      const custom = 'cubic-bezier(0.25, 0.1, 0.25, 1.0)';
      expect(parseCubicBezier(custom)).toEqual([0.25, 0.1, 0.25, 1.0]);

      // Fallback on invalid format defaults to linear
      expect(parseCubicBezier('invalid-value')).toEqual([0, 0, 1, 1]);
    });

    it('formats 4 control point values to a css cubic-bezier string', () => {
      const formatted = formatCubicBezier(0.25, 0.1, 0.25, 1.0);
      expect(formatted).toBe('cubic-bezier(0.25, 0.1, 0.25, 1)');
    });

    it('samples points along a cubic Bezier curve smoothly and monotonically in time', () => {
      const points = sampleCubicBezierCurve(
        0.42, 0, 0.58, 1, // ease-in-out control points
        10 // 10 steps
      );

      expect(points.length).toBe(11);
      expect(points[0].x).toBeCloseTo(0);
      expect(points[0].y).toBeCloseTo(0);
      expect(points[points.length - 1].x).toBeCloseTo(1);
      expect(points[points.length - 1].y).toBeCloseTo(1);

      // Verify strictly increasing x coordinates
      for (let i = 1; i < points.length; i++) {
        expect(points[i].x).toBeGreaterThan(points[i - 1].x);
      }
    });
  });
});
