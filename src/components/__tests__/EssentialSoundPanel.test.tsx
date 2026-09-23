import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { EssentialSoundPanel } from '../EssentialSoundPanel';
import { useTimelineStore } from '../../store/timelineStore';
import { createRational } from '../../types/time';
import { analyzeClipBands } from '../../services/audioAnalyze';

vi.mock('../../services/audioAnalyze', () => ({
  analyzeClipBands: vi.fn(),
}));

function seedClipStore(selected = true) {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'a1',
        type: 'audio',
        index: 2,
        name: 'A1',
        muted: false,
        locked: false,
        solo: false,
        height: 56,
        clips: [
          {
            id: 'clip_ess_1',
            assetId: 'asset_1',
            name: 'Dialogue.wav',
            startOffset: createRational(0, 1),
            duration: createRational(4, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
          },
          {
            id: 'clip_ess_2',
            assetId: 'asset_2',
            name: 'Musicbed.wav',
            startOffset: createRational(4, 1),
            duration: createRational(4, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
          },
        ],
      },
    ],
    selectedClipIds: selected ? ['clip_ess_1'] : [],
  });
}

function getClip() {
  return useTimelineStore
    .getState()
    .tracks.flatMap((t) => t.clips)
    .find((c) => c.id === 'clip_ess_1')!;
}

describe('R24.3 — EssentialSoundPanel', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(analyzeClipBands).mockReset();
  });

  it('asks for a clip instead of tagging blindly', () => {
    seedClipStore(false);
    render(<EssentialSoundPanel />);
    expect(screen.getByText('Select a clip to tag its Essential Sound role.')).toBeTruthy();
  });

  it('tags the role through an undoable command', () => {
    seedClipStore();
    render(<EssentialSoundPanel />);
    fireEvent.change(screen.getByLabelText('Audio role'), { target: { value: 'dialogue' } });
    expect(getClip().audioRole).toBe('dialogue');
    expect(screen.getByText(/Never ducked/)).toBeTruthy();

    useTimelineStore.getState().undo();
    expect(getClip().audioRole).toBeUndefined();
  });

  it('writes compressor and de-esser params onto the audioEffects chain', () => {
    seedClipStore();
    render(<EssentialSoundPanel />);
    fireEvent.change(screen.getByLabelText('Comp threshold'), { target: { value: '-18' } });
    fireEvent.change(screen.getByLabelText('De-esser'), { target: { value: '75' } });

    const chain = getClip().audioEffects ?? [];
    expect(chain.find((e) => e.type === 'dynamics_compressor')?.params).toEqual({
      thresholdDb: -18,
      ratio: 3,
    });
    expect(chain.find((e) => e.type === 'dynamics_deesser')?.params).toEqual({ amount: 0.75 });
  });

  it('keeps Match disabled until a reference clip is picked', () => {
    seedClipStore();
    render(<EssentialSoundPanel />);
    const btn = screen.getByText('Match to reference').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('writes an EQ match from analyzed spectra onto the clip chain', async () => {
    seedClipStore();
    render(<EssentialSoundPanel />);
    vi.mocked(analyzeClipBands)
      .mockResolvedValueOnce(new Array(10).fill(0))
      .mockResolvedValueOnce([6, 5, 4, 3, 2, 1, 0, -1, -2, -3]);

    fireEvent.change(screen.getByLabelText('Reference clip'), { target: { value: 'clip_ess_2' } });
    const btn = screen.getByText('Match to reference').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    await waitFor(() => {
      expect(getClip().audioEffects?.find((e) => e.type === 'eq_match')).toBeDefined();
    });
    const bands = (getClip().audioEffects?.find((e) => e.type === 'eq_match')?.params as {
      bands: { hz: number; db: number }[];
    }).bands;
    expect(bands).toHaveLength(10);
    // Smoothed first delta: 0.25*6 + 0.5*6 + 0.25*5 = 5.75.
    expect(bands[0].db).toBeCloseTo(5.75, 12);
    expect(screen.getByText(/Matched to Musicbed.wav/)).toBeTruthy();
  });

  it('reports analyzer failures honestly instead of writing a match', async () => {
    seedClipStore();
    render(<EssentialSoundPanel />);
    vi.mocked(analyzeClipBands).mockRejectedValue(new Error('no WebAudio decoder on this host'));

    fireEvent.change(screen.getByLabelText('Reference clip'), { target: { value: 'clip_ess_2' } });
    fireEvent.click(screen.getByText('Match to reference').closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByText(/Match failed: no WebAudio decoder/)).toBeTruthy();
    });
    expect(getClip().audioEffects?.find((e) => e.type === 'eq_match')).toBeUndefined();
  });
});
