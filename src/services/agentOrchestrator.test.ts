import { describe, it, expect, beforeEach, vi } from 'vitest';
import { agentOrchestrator, AgentPlanner, AgentPlanStep } from './agentOrchestrator';
import { useTimelineStore } from '../store/timelineStore';
import { setRuntimeMode } from './runtimeConfig';
import { globalToolRegistry } from './tools/registry';
import { Command } from '../core/commands';
import { TimelineState } from '../types/timeline';

class DummyCommand implements Command {
  apply(state: any) { return { ...state, dummy: true }; }
  invert(state: any) { return { ...state, dummy: false }; }
}

class MockPlanner implements AgentPlanner {
  async generatePlan(prompt: string, _state: TimelineState): Promise<AgentPlanStep[]> {
    const lower = prompt.toLowerCase();
    if (lower.includes('remove silence')) {
      return [
        {
          tool: 'timeline_remove_silence',
          args: {
            threshold_seconds: 0.5
          }
        }
      ];
    } else if (lower.includes('make it vertical')) {
      return [
        {
          tool: 'sequence_set_aspect_ratio',
          args: {
            width: 1080,
            height: 1920
          }
        },
        {
          tool: 'video_apply_auto_reframe',
          args: {
            track_id: 'main_video'
          }
        }
      ];
    }
    return [];
  }
}

describe('AgentOrchestratorService R7.3', () => {
  let mockPlanner: MockPlanner;

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
    mockPlanner = new MockPlanner();
  });

  it('Given a scripted plan, the orchestrator executes the expected tool sequence and state deltas; failure mid-plan rolls back via R7.2', async () => {
    // Mock tool executors in the global registry to return DummyCommand
    const executeSpy = vi.spyOn(globalToolRegistry, 'execute').mockImplementation(async (name, _args) => {
      if (name === 'timeline_remove_silence') {
        return [new DummyCommand()];
      }
      if (name === 'sequence_set_aspect_ratio') {
        return new DummyCommand();
      }
      if (name === 'video_apply_auto_reframe') {
        return { error: 'mocked failure' };
      }
      return null;
    });

    const logs: any[] = [];

    // Test success case
    const commands = await agentOrchestrator.processPrompt('remove silence', (log) => logs.push(log), mockPlanner);

    expect(executeSpy).toHaveBeenCalledWith('timeline_remove_silence', { threshold_seconds: 0.5 });

    // In R9.7, the orchestrator returns commands instead of applying them automatically
    expect(commands.length).toBe(1);

    // We can simulate applying them manually if we want to test state.past
    if (commands.length > 0) {
       const { CompoundCommand } = await import('../core/commands/transaction');
       useTimelineStore.getState().executeCommand(new CompoundCommand(commands));
    }

    const state = useTimelineStore.getState();
    // One compound command should be in the history
    expect(state.past.length).toBe(1);

    // Test failure case (rolls back automatically because error is thrown and compound command is never returned)
    executeSpy.mockClear();
    logs.length = 0;

    let caughtError = null;
    try {
      await agentOrchestrator.processPrompt('make it vertical', (log) => logs.push(log), mockPlanner);
    } catch (e: any) {
      caughtError = e;
    }

    expect(caughtError).not.toBeNull();
    expect(executeSpy).toHaveBeenCalledWith('sequence_set_aspect_ratio', { width: 1080, height: 1920 });
    expect(executeSpy).toHaveBeenCalledWith('video_apply_auto_reframe', { track_id: 'main_video' });

    // Past should still be 1 (the compound command wasn't applied)
    const state2 = useTimelineStore.getState();
    expect(state2.past.length).toBe(1);
  });
});
