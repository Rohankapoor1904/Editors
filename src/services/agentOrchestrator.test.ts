import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentOrchestrator } from './agentOrchestrator';
import { useTimelineStore } from '../store/timelineStore';
import { setRuntimeMode } from './runtimeConfig';
import { sileroVadService } from './sileroVad';

describe('AgentOrchestratorService R7.2', () => {
  beforeEach(() => {
    setRuntimeMode('demo');
    useTimelineStore.setState({
      past: [],
      future: [],
      tracks: [
        {
          id: 'test_track',
          type: 'video',
          index: 0,
          name: 'V1',
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [],
        }
      ]
    });
  });

  it('an agent run issuing multiple tool calls is reverted by exactly one undo', async () => {
    // Mock silero to return 5 silence windows
    vi.spyOn(sileroVadService, 'detectSilence').mockResolvedValue([
      { startTime: 1.0, endTime: 2.0, duration: 1.0 },
      { startTime: 3.0, endTime: 4.0, duration: 1.0 },
      { startTime: 5.0, endTime: 6.0, duration: 1.0 },
      { startTime: 7.0, endTime: 8.0, duration: 1.0 },
      { startTime: 9.0, endTime: 10.0, duration: 1.0 },
    ]);

    const logs: any[] = [];
    await agentOrchestrator.processPrompt('remove silence', (log) => logs.push(log));

    const state = useTimelineStore.getState();
    // Verify that we have exactly 1 command in the past array
    expect(state.past.length).toBe(1);

    // Call undo
    state.undo();
    const stateAfterUndo = useTimelineStore.getState();
    expect(stateAfterUndo.past.length).toBe(0);
  });
});
