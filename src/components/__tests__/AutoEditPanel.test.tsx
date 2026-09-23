import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { AutoEditPanel } from '../AutoEditPanel';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { runAutoEdit } from '../../engine/autoEdit/autoEditPipeline';
import { createRational } from '../../types/time';

vi.mock('../../engine/autoEdit/autoEditPipeline', () => ({
  runAutoEdit: vi.fn(),
  defaultPerceptionServices: {},
}));

function seedStores() {
  useMediaPoolStore.setState({
    assets: [
      {
        id: 'a1', name: 'Take1.mp4', path: 'blob:t1', type: 'video',
        duration: '00:00:10', fingerprint: 'fp1', isOffline: false,
      },
      {
        id: 'a2', name: 'Take2.mp4', path: 'blob:t2', type: 'video',
        duration: '00:00:10', fingerprint: 'fp2', isOffline: false,
      },
    ],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64, clips: [],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(0, 1),
    markers: [],
    comments: [],
  });
}

describe('R25.1 — AutoEditPanel', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(runAutoEdit).mockReset();
  });

  it('asks for footage instead of assembling the void', () => {
    useMediaPoolStore.setState({ assets: [] });
    render(<AutoEditPanel />);
    expect(screen.getByText('Import footage into the media pool to auto-edit.')).toBeTruthy();
  });

  it('runs the pipeline on checked footage and dispatches one transaction', async () => {
    seedStores();
    const fakeTx = { apply: (s: unknown) => s, invert: (s: unknown) => s };
    vi.mocked(runAutoEdit).mockResolvedValue({
      takes: [
        {
          assetId: 'a1', assetName: 'Take1.mp4',
          score: { score: 90, verdict: 'keep', reasons: ['dense speech'] },
        },
      ],
      kept: 1,
      dropped: 1,
      inserts: [],
      transaction: fakeTx,
    } as unknown as Awaited<ReturnType<typeof runAutoEdit>>);
    const spy = vi.spyOn(useTimelineStore.getState(), 'executeCommand');

    render(<AutoEditPanel />);
    fireEvent.click(screen.getByLabelText('Select Take1.mp4'));
    fireEvent.click(screen.getByLabelText('Select Take2.mp4'));
    fireEvent.click(screen.getByText('Assemble rough cut (2)'));

    await waitFor(() => {
      expect(runAutoEdit).toHaveBeenCalledTimes(1);
    });
    const [, services, opts] = vi.mocked(runAutoEdit).mock.calls[0];
    expect(services).toEqual({});
    expect((opts as { trackId: string }).trackId).toBe('v1');
    expect(spy).toHaveBeenCalledWith(fakeTx);
    expect(await screen.findByText(/Rough cut ready: kept 1, dropped 1/)).toBeTruthy();
    spy.mockRestore();
  });

  it('surfaces pipeline failure without touching the timeline', async () => {
    seedStores();
    vi.mocked(runAutoEdit).mockRejectedValue(new Error('stt_unavailable: model missing'));
    const spy = vi.spyOn(useTimelineStore.getState(), 'executeCommand');

    render(<AutoEditPanel />);
    fireEvent.click(screen.getByLabelText('Select Take1.mp4'));
    fireEvent.click(screen.getByText('Assemble rough cut (1)'));

    expect(await screen.findByText(/Auto-Edit failed: stt_unavailable/)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
