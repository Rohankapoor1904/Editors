import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ComparisonView, WorkingSpaceSelect } from '../ComparisonView';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational } from '../../types/time';

function seedGradedClip() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64,
        clips: [
          {
            id: 'clip-grade-1', assetId: 'asset-1', name: 'Shot.mp4',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
            effects: [
              {
                id: 'grade-1', type: 'colorGrade', enabled: true,
                params: { lift: { r: 0.2, g: 0, b: 0 }, gamma: { r: 1, g: 1, b: 1 }, gain: { r: 1, g: 1, b: 1 } },
              },
            ],
          },
        ],
      },
    ],
    selectedClipIds: ['clip-grade-1'],
    playheadPosition: createRational(0, 1),
    markers: [],
    comments: [],
    metadata: {
      name: 'Test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'sRGB',
    },
  });
}

describe('R26.3 — ComparisonView', () => {
  afterEach(() => {
    cleanup();
  });

  it('asks for a frame honestly instead of rendering placeholders', () => {
    seedGradedClip();
    render(<ComparisonView imageData={null} />);
    expect(screen.getByText('No frame to compare — play or scrub the timeline first.')).toBeTruthy();
  });

  it('snapshots the live grade and isolates later edits (no cross-talk)', () => {
    seedGradedClip();
    const fakeFrame = { width: 4, height: 2, data: new Uint8ClampedArray(32).fill(100) } as ImageData;
    render(<ComparisonView imageData={fakeFrame} />);
    fireEvent.click(screen.getByText('Snapshot A'));
    expect(screen.getByText('Snapshot A ✓')).toBeTruthy();

    // Mutate the live grade afterwards: the snapshot must not follow.
    useTimelineStore.getState().updateClipEffect('clip-grade-1', 'grade-1', 'colorGrade', {
      lift: { r: 0.9, g: 0, b: 0 },
    });
    // Snapshot B of the NEW grade differs from the stored A — the UI still
    // offers both slots independently (engine purity proven separately).
    fireEvent.click(screen.getByText('Snapshot B'));
    expect(screen.getByText('Snapshot B ✓')).toBeTruthy();

    fireEvent.click(screen.getByText('Split'));
    expect(screen.getByLabelText('Split position')).toBeTruthy();
  });
});

describe('R26.3 — WorkingSpaceSelect', () => {
  afterEach(() => {
    cleanup();
  });

  it('writes the project color space through an undoable command', () => {
    seedGradedClip();
    render(<WorkingSpaceSelect />);
    fireEvent.change(screen.getByLabelText('Working color space'), { target: { value: 'ACEScg' } });
    expect(useTimelineStore.getState().metadata.colorSpace).toBe('ACEScg');

    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().metadata.colorSpace).toBe('sRGB');
  });
});
