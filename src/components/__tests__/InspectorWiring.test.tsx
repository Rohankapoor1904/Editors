import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AIPromptConsole } from '../AIPromptConsole';
import { useTimelineStore } from '../../store/timelineStore';
import { useAgentStore } from '../../store/agentStore';
import { secondsToRational } from '../../types/time';
import { agentOrchestrator } from '../../services/agentOrchestrator';

vi.mock('../../services/agentOrchestrator', () => ({
  agentOrchestrator: {
    processPrompt: vi.fn(),
  },
}));

function seedClipStore() {
  useAgentStore.setState({
    isConnected: false,
    activeModel: 'test-model',
    currentTask: null,
    taskHistory: [],
    actionDiffs: [],
    isProcessing: false,
  });
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
            id: 'clip_ins_1',
            assetId: 'asset_1',
            name: 'Clip1.mp4',
            startOffset: secondsToRational(0, 30),
            duration: secondsToRational(10, 30),
            sourceIn: secondsToRational(0, 30),
            sourceOut: secondsToRational(10, 30),
            transform: {
              position: { x: 0.5, y: 0.5 },
              scale: { x: 1.5, y: 1.5 },
              rotation: 0,
              opacity: 1,
              anchorPoint: { x: 0.5, y: 0.5 },
            },
            volume: 0,
          },
        ],
      },
    ],
    selectedClipIds: ['clip_ins_1'],
  });
}

function openInspector() {
  render(<AIPromptConsole />);
  fireEvent.click(screen.getByText('Inspector'));
}

function getClip() {
  return useTimelineStore
    .getState()
    .tracks.flatMap((t) => t.clips)
    .find((c) => c.id === 'clip_ins_1')!;
}

describe('R22.3: Inspector controls dispatch real commands', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    seedClipStore();
  });

  it('scale slider reflects the clip and dispatches an undoable transform command', () => {
    openInspector();
    const slider = screen.getByTestId('inspector-scale') as HTMLInputElement;
    expect(slider.value).toBe('150');

    fireEvent.change(slider, { target: { value: '200' } });
    expect(getClip().transform!.scale.x).toBe(2);
    expect(getClip().transform!.scale.y).toBe(2);

    useTimelineStore.getState().undo();
    expect(getClip().transform!.scale.x).toBe(1.5);
  });

  it('position inputs move the clip in normalized units', () => {
    openInspector();
    const posX = screen.getByTestId('inspector-pos-x') as HTMLInputElement;
    expect(posX.value).toBe('0.5');

    fireEvent.change(posX, { target: { value: '0.25' } });
    expect(getClip().transform!.position.x).toBe(0.25);
    // Untouched axes survive the merge
    expect(getClip().transform!.position.y).toBe(0.5);
    expect(getClip().transform!.scale.x).toBe(1.5);
  });

  it('volume slider writes clip volume in dB (undoable)', () => {
    openInspector();
    fireEvent.change(screen.getByTestId('inspector-volume'), { target: { value: '-6' } });
    expect(getClip().volume).toBe(-6);

    useTimelineStore.getState().undo();
    expect(getClip().volume).toBe(0);
  });

  it('contrast slider creates a colorGrade effect with engine-native params', () => {
    openInspector();
    fireEvent.change(screen.getByTestId('inspector-contrast'), { target: { value: '20' } });
    const effect = getClip().effects?.find((e) => e.type === 'colorGrade');
    expect(effect).toBeDefined();
    expect((effect!.params as Record<string, unknown>).contrast).toBeCloseTo(1.2, 6);
  });

  it('empty plans create no diff card', async () => {
    vi.mocked(agentOrchestrator.processPrompt).mockResolvedValueOnce([]);
    render(<AIPromptConsole />);

    const input = screen.getAllByPlaceholderText('Type / for commands, or ask AI to edit...')[0];
    fireEvent.change(input, { target: { value: 'flibbertigibbet' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(useAgentStore.getState().currentTask?.status).toBe('completed');
    });
    expect(screen.queryByText(/AI Action: flibbertigibbet/i)).not.toBeInTheDocument();
  });

  it('failed prompts record task failure without throwing out of the handler', async () => {
    vi.mocked(agentOrchestrator.processPrompt).mockRejectedValueOnce(new Error('boom'));
    render(<AIPromptConsole />);

    const input = screen.getAllByPlaceholderText('Type / for commands, or ask AI to edit...')[0];
    fireEvent.change(input, { target: { value: 'do it' } });
    // Must not throw (R22.3 dropped the bare re-throw).
    fireEvent.submit(input);

    await waitFor(() => {
      expect(useAgentStore.getState().currentTask?.status).toBe('failed');
    });
    expect(useAgentStore.getState().currentTask?.error).toContain('boom');
  });
});
