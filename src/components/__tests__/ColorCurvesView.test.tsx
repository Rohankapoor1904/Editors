import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ColorCurvesView } from '../ColorCurvesView';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational } from '../../types/time';
import { webgpuEngine } from '../../engine/webgpuRenderer';

function seedClipStore() {
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
            id: 'clip_cc_1',
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
    selectedClipIds: ['clip_cc_1'],
  });
}

function getClip() {
  return useTimelineStore
    .getState()
    .tracks.flatMap((t) => t.clips)
    .find((c) => c.id === 'clip_cc_1')!;
}

function gradeParams(): Record<string, unknown> {
  return (getClip().effects?.find((e) => e.type === 'colorGrade')?.params ?? {}) as Record<string, unknown>;
}

describe('R24.2 remainder — ColorCurvesView', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('applies a curve preset as an undoable colorGrade effect', () => {
    vi.spyOn(webgpuEngine, 'getImageData').mockReturnValue(null);
    seedClipStore();
    render(<ColorCurvesView />);

    fireEvent.click(screen.getByText('S-Contrast'));
    const curves = gradeParams().curves as { master: { input: number; output: number }[] };
    expect(curves.master).toHaveLength(4);
    expect(curves.master[1]).toEqual({ input: 0.25, output: 0.2 });

    fireEvent.click(screen.getByText('Identity'));
    expect(gradeParams().curves).toBeUndefined();
  });

  it('disables Auto Color honestly when no frame is readable', () => {
    vi.spyOn(webgpuEngine, 'getImageData').mockReturnValue(null);
    seedClipStore();
    render(<ColorCurvesView />);

    const btn = screen.getByText('Auto Color').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/No readable frame/);
  });

  it('derives Auto Color params from a real warm frame', async () => {
    // Warm fixture: red clearly above blue.
    const data = new Uint8ClampedArray([153, 128, 77, 255, 153, 128, 77, 255]);
    vi.spyOn(webgpuEngine, 'getImageData').mockReturnValue({ width: 2, height: 1, data } as ImageData);
    seedClipStore();
    render(<ColorCurvesView />);

    const btn = screen.getByText('Auto Color').closest('button') as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    fireEvent.click(btn);

    const params = gradeParams();
    expect(params.temperature as number).toBeLessThan(0);
    // Fixture luma (~0.51) sits above the 0.18 exposure target, so the
    // solver darkens (negative offset) rather than lifting.
    expect((params.offset as { r: number }).r).toBeLessThan(0);
  });
});
