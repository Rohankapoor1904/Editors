import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AIPromptConsole } from '../AIPromptConsole';
import { useTimelineStore } from '../../store/timelineStore';
import { useAgentStore } from '../../store/agentStore';
import { createRational } from '../../types/time';

vi.mock('../../services/agentOrchestrator', () => ({
  agentOrchestrator: {
    processPrompt: vi.fn(),
  },
}));

function seedStores() {
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
            id: 'clip_bg_1',
            assetId: 'asset_1',
            name: 'Greenscreen.mp4',
            startOffset: createRational(0, 1),
            sourceIn: createRational(0, 1),
            sourceOut: createRational(4, 1),
            duration: createRational(4, 1),
          },
        ],
      },
    ],
    selectedClipIds: ['clip_bg_1'],
  });
}

function bgEffect() {
  return useTimelineStore
    .getState()
    .tracks.flatMap((t) => t.clips)
    .find((c) => c.id === 'clip_bg_1')
    ?.effects?.find((e) => e.type === 'bg_remove');
}

describe('R25.5 — Inspector background-remove section', () => {
  afterEach(() => {
    cleanup();
  });

  it('applies a bg_remove entry and disables it back (frame restored)', () => {
    seedStores();
    render(<AIPromptConsole />);
    fireEvent.click(screen.getByText('Inspector'));
    expect(screen.getByText('No background effect on this clip.')).toBeTruthy();

    fireEvent.click(screen.getByText('Apply background remove'));
    const applied = bgEffect();
    expect(applied?.enabled).toBe(true);
    expect((applied?.params as { strategy: string }).strategy).toBe('chroma');
    expect(screen.getByText(/Active: chroma \(enabled\)/)).toBeTruthy();

    fireEvent.click(screen.getByText('Disable'));
    expect(bgEffect()?.enabled).toBe(false);
    expect(screen.getByText(/Active: chroma \(disabled\)/)).toBeTruthy();

    fireEvent.click(screen.getByText('Enable'));
    expect(bgEffect()?.enabled).toBe(true);
  });

  it('stays inert without a selected clip', () => {
    seedStores();
    useTimelineStore.setState({ selectedClipIds: [] });
    render(<AIPromptConsole />);
    fireEvent.click(screen.getByText('Inspector'));
    const apply = screen.getByText('Apply background remove').closest('button') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });
});
