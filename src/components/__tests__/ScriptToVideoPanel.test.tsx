import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ScriptToVideoPanel } from '../ScriptToVideoPanel';
import { AIPromptConsole } from '../AIPromptConsole';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { useAgentStore } from '../../store/agentStore';
import { createRational, rationalToSeconds } from '../../types/time';

const SCRIPT = `Cold Open\nWelcome to the show today.\n\nOutro\nThanks for watching.`;

function seedStores() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64, clips: [],
      },
      {
        id: 'a1', type: 'audio', index: 1, name: 'A1',
        muted: false, locked: false, solo: false, height: 56, clips: [],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(0, 1),
    markers: [],
    comments: [],
  });
  useMediaPoolStore.setState({
    assets: [
      {
        id: 'bed1', name: 'Bed.mp3', path: 'blob:bed', type: 'audio',
        duration: '00:01:00', fingerprint: 'fpb', isOffline: false,
      },
    ],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
  useAgentStore.setState({
    isConnected: false,
    activeModel: 'test-model',
    currentTask: null,
    taskHistory: [],
    actionDiffs: [],
    isProcessing: false,
  });
}

describe('R25.2 — ScriptToVideoPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('lays scene cards plus the bed in one undoable draft', () => {
    seedStores();
    render(<ScriptToVideoPanel />);

    fireEvent.change(screen.getByLabelText('Script text'), { target: { value: SCRIPT } });
    expect(screen.getByText(/2 scenes/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Music bed asset'), { target: { value: 'bed1' } });
    fireEvent.click(screen.getByText('Generate draft timeline'));

    const state = useTimelineStore.getState();
    expect(state.tracks[0].clips).toHaveLength(2);
    expect(state.tracks[1].clips).toHaveLength(1);
    expect(state.tracks[0].clips[0].title?.text).toMatch(/Cold Open/);
    const bed = state.tracks[1].clips[0];
    expect(bed.assetId).toBe('bed1');
    // Bed spans the full estimated draft.
    const scenes = state.tracks[0].clips.reduce((sum, c) => sum + rationalToSeconds(c.duration), 0);
    expect(rationalToSeconds(bed.duration)).toBeCloseTo(scenes, 6);
    expect(screen.getByText(/Draft ready: 2 scenes/)).toBeTruthy();

    useTimelineStore.getState().undo();
    const undone = useTimelineStore.getState();
    expect(undone.tracks[0].clips).toHaveLength(0);
    expect(undone.tracks[1].clips).toHaveLength(0);
  });

  it('mounts as the Script tab in the copilot console', () => {
    seedStores();
    render(<AIPromptConsole />);
    fireEvent.click(screen.getByText('Script'));
    expect(screen.getByLabelText('Script text')).toBeTruthy();
  });
});
