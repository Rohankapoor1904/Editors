import { useTimelineStore } from '../store/timelineStore';
import { isLiveMode, NotImplementedError } from './runtimeConfig';
import { CompoundCommand } from '../core/commands/transaction';
import { Command } from '../core/commands';
import { globalToolRegistry } from './tools/registry';
import { TimelineState } from '../types/timeline';

export interface AgentStepLog {
  type: 'thought' | 'tool' | 'response' | 'user';
  message: string;
}

export interface AgentPlanStep {
  tool: string;
  args: any;
}

export interface AgentPlanner {
  generatePlan(prompt: string, state: TimelineState): Promise<AgentPlanStep[]>;
}

export class AgentOrchestratorService {
  /**
   * Autonomous ReAct Agent Execution Loop
   */
  async processPrompt(
    prompt: string,
    onLog: (log: AgentStepLog) => void,
    planner?: AgentPlanner
  ): Promise<void> {
    onLog({ type: 'user', message: prompt });

    if (isLiveMode()) {
      throw new NotImplementedError('ReAct Agent Tool & Reasoning Loop');
    }

    onLog({ type: 'thought', message: `Evaluating user intent for prompt: "${prompt}"...` });

    const state = useTimelineStore.getState();
    const plan = planner ? await planner.generatePlan(prompt, state) : [];

    if (plan.length === 0) {
      onLog({
        type: 'response',
        message: `Processed agent action: ${prompt}`,
      });
      return;
    }

    const executedCommands: Command[] = [];

    for (const step of plan) {
      onLog({ type: 'thought', message: `Planning to execute tool: ${step.tool}` });

      const result = await globalToolRegistry.execute(step.tool, step.args);

      if (result && typeof result === 'object' && 'error' in result) {
        onLog({
          type: 'tool',
          message: `Tool ${step.tool} failed: ${result.error}`,
        });

        // If mid-plan failure, rollback happens via standard exception flow if needed,
        // but here we are in a deterministic mock environment so we just abort.
        throw new Error(`Tool execution failed: ${result.error}`);
      }

      onLog({
        type: 'tool',
        message: `${step.tool}() -> Success.`,
      });

      // Assume the tool executor returned a Command or array of Commands to apply
      if (result && typeof (result as any).apply === 'function') {
        executedCommands.push(result as Command);
      } else if (Array.isArray(result) && result.every(r => r && typeof r.apply === 'function')) {
        executedCommands.push(...result);
      }
    }

    if (executedCommands.length > 0) {
      const compoundCmd = new CompoundCommand(executedCommands);
      useTimelineStore.getState().executeCommand(compoundCmd);
    }

    onLog({
      type: 'response',
      message: `Successfully executed agent plan with ${plan.length} steps.`,
    });
  }
}

export const agentOrchestrator = new AgentOrchestratorService();
