import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { AIPromptConsole } from '../AIPromptConsole';
import { useTimelineStore } from '../../store/timelineStore';
import { secondsToRational } from '../../types/time';
import { RippleDeleteCommand } from '../../core/commands/edits';
import { agentOrchestrator } from '../../services/agentOrchestrator';

import { useAgentStore } from '../../store/agentStore';

vi.mock('../../services/runtimeConfig', () => ({
  isLiveMode: () => false,
  NotImplementedError: class extends Error {},
}));

vi.mock('../../services/agentOrchestrator', () => ({
  agentOrchestrator: {
    processPrompt: vi.fn(),
  }
}));

describe('AIPromptConsole R9.7 Features', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({
      isConnected: false,
      activeModel: 'CineCraft ReAct Copilot (Whisper ONNX + WebGPU)',
      currentTask: null,
      taskHistory: [],
      actionDiffs: [],
      isProcessing: false,
    });
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track_a1',
          type: 'audio',
          index: 0,
          name: 'A1 - Dialogue Track',
          muted: false,
          locked: false,
          solo: false,
          height: 56,
          clips: [
             {
               "id": "clip_a1_001",
               "assetId": "asset_interview_01",
               "name": "Interview_Take1.wav",
               "startOffset": secondsToRational(0.0),
               "sourceIn": secondsToRational(0.0),
               "sourceOut": secondsToRational(15.0),
               "duration": secondsToRational(15.0),
               "volume": 0,
               "pan": 0
             }
          ]
        }
      ]
    });
  });

  it('accepting a silence-cut diff executes real ripple deletes on the timeline', async () => {
    // Mock the prompt response to return a RippleDeleteCommand for the first 5 seconds
    vi.mocked(agentOrchestrator.processPrompt).mockResolvedValueOnce([
      new RippleDeleteCommand(secondsToRational(0.0), secondsToRational(5.0))
    ]);

    render(<AIPromptConsole />);

    // Submit prompt
    const input = screen.getAllByPlaceholderText('Type / for commands, or ask AI to edit...')[0];
    fireEvent.change(input, { target: { value: '/denoise' } });
    fireEvent.submit(input);

    // Wait for card to appear
    await waitFor(() => {
      expect(screen.getByText(/AI Action: \/denoise/i)).toBeInTheDocument();
    });

    // Check store before acceptance
    let track = useTimelineStore.getState().tracks[0];
    expect(track.clips[0].startOffset.value).toBe(0);

    // Click "Apply Diff"
    const applyButton = screen.getByText('Apply Diff');
    fireEvent.click(applyButton);

    // Wait for the store to update asynchronously
    await waitFor(() => {
      track = useTimelineStore.getState().tracks[0];
      // The ripple delete removed the first 5 seconds, so the remaining 10s should be at 0s.
      // Actually, since the clip is 0-15, deleting 0-5 should shift it?
      // RippleDelete of 0-5 on a clip that starts at 0 and lasts 15s will split/trim it.
      // The new duration should be 10s, and it will be shifted left by 5s. But wait, if it was at 0, deleting 0-5 makes it 10s long starting at 0!
      // Let's assert duration changes to 10.
      expect(track.clips[0].duration.value / track.clips[0].duration.rate).toBe(10);
    });
  });

  it('rolling back reverts the timeline state to pre-AI snapshot', async () => {
    // Initial state: duration 15
    let track = useTimelineStore.getState().tracks[0];
    expect(track.clips[0].duration.value / track.clips[0].duration.rate).toBe(15);

    // Mock prompt response to return a RippleDeleteCommand
    vi.mocked(agentOrchestrator.processPrompt).mockResolvedValueOnce([
      new RippleDeleteCommand(secondsToRational(0.0), secondsToRational(5.0))
    ]);

    render(<AIPromptConsole />);

    const input = screen.getAllByPlaceholderText('Type / for commands, or ask AI to edit...')[0];
    fireEvent.change(input, { target: { value: '/denoise' } });
    fireEvent.submit(input);

    await waitFor(() => {
      expect(screen.getByText(/AI Action: \/denoise/i)).toBeInTheDocument();
    });

    // Accept it globally
    const acceptAllButton = screen.getAllByTitle('Accept all AI modifications')[0];
    fireEvent.click(acceptAllButton);

    // Verify it changed
    await waitFor(() => {
      track = useTimelineStore.getState().tracks[0];
      expect(track.clips[0].duration.value / track.clips[0].duration.rate).toBe(10);
    });

    // Now roll it back
    const rollbackButton = screen.getAllByTitle('Rollback AI changes')[0];
    fireEvent.click(rollbackButton);

    // Verify state reverted
    await waitFor(() => {
      track = useTimelineStore.getState().tracks[0];
      expect(track.clips[0].duration.value / track.clips[0].duration.rate).toBe(15);
    });
  });

  it('shows honest idle state without fake green checkmarks by default', () => {
    render(<AIPromptConsole />);

    // In idle mode, should show readiness message
    expect(screen.getByText('Agentic Pipeline Ready')).toBeInTheDocument();
    expect(screen.getByText(/Connect any external model or agent/i)).toBeInTheDocument();

    // Steppers should show step numbers 1, 2, 3, 4 rather than completed checkmarks
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();

    // Stepper labels present
    expect(screen.getByText('Analyzing')).toBeInTheDocument();
    expect(screen.getByText('Transcribing')).toBeInTheDocument();
    expect(screen.getByText('Slicing')).toBeInTheDocument();
    expect(screen.getByText('Arranging')).toBeInTheDocument();
  });

  it('updates stepper and displays thought logs when external agent executes a task via bridge', async () => {
    render(<AIPromptConsole />);

    let taskId = '';
    act(() => {
      useAgentStore.getState().setActiveModel('Claude 3.7 Sonnet (via Agent Bridge)');
      useAgentStore.getState().setConnected(true);

      taskId = useAgentStore.getState().startTask({
        source: 'bridge',
        prompt: 'Remove dead air pauses > 0.5s',
      });

      useAgentStore.getState().updateTaskStep(taskId, 1, 'Transcribing dialogue audio...');
      useAgentStore.getState().addTaskLog(taskId, {
        type: 'thought',
        message: 'Inspecting dialogue track for silence windows exceeding 500ms',
      });
    });

    // Task prompt, log, step label, and processing badge should be visible
    await waitFor(() => {
      expect(screen.getAllByText(/Remove dead air pauses > 0.5s/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Inspecting dialogue track for silence windows/i)).toBeInTheDocument();
      expect(screen.getByText('Transcribing dialogue audio...')).toBeInTheDocument();
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    // Now complete the task
    act(() => {
      useAgentStore.getState().completeTask(taskId, 3);
    });

    await waitFor(() => {
      expect(screen.getAllByText(/completed/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Bridge Connected')).toBeInTheDocument();
    });
  });
});
