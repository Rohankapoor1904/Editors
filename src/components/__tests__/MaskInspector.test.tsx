import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MaskInspector } from '../MaskInspector';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational } from '../../types/time';

function seedClipStore(selected = true) {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1',
        type: 'video',
        index: 0,
        name: 'V1',
        muted: false,
        locked: false,
        solo: false,
        height: 64,
        clips: [
          {
            id: 'clip_mask_1',
            assetId: 'asset_1',
            name: 'Clip1.mp4',
            startOffset: createRational(0, 1),
            duration: createRational(4, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
          },
        ],
      },
    ],
    selectedClipIds: selected ? ['clip_mask_1'] : [],
  });
}

function getClip() {
  return useTimelineStore
    .getState()
    .tracks.flatMap((t) => t.clips)
    .find((c) => c.id === 'clip_mask_1')!;
}

describe('R24.1 remainder — MaskInspector', () => {
  afterEach(() => {
    cleanup();
  });

  it('asks for a clip selection instead of inventing a target', () => {
    seedClipStore(false);
    render(<MaskInspector />);
    expect(screen.getByText('Select a video clip to add a mask')).toBeTruthy();
  });

  it('adds, edits and removes a mask through real store commands', () => {
    seedClipStore();
    render(<MaskInspector />);
    expect(screen.getByText('Mask (0)')).toBeTruthy();

    fireEvent.click(screen.getByText('+ Add'));
    expect(getClip().masks).toHaveLength(1);
    expect(getClip().masks?.[0].shape).toBe('rect');
    expect(screen.getByText('Mask (1)')).toBeTruthy();

    const id = getClip().masks?.[0].id as string;
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '0.7' } });
    expect(getClip().masks?.find((m) => m.id === id)?.centerX).toBeCloseTo(0.7, 12);

    fireEvent.click(screen.getByText('Remove'));
    expect(getClip().masks).toHaveLength(0);
  });

  it('undoes a UI-added mask with one store undo', () => {
    seedClipStore();
    render(<MaskInspector />);
    fireEvent.click(screen.getByText('+ Add'));
    expect(getClip().masks).toHaveLength(1);
    useTimelineStore.getState().undo();
    expect(getClip().masks ?? []).toHaveLength(0);
  });
});
