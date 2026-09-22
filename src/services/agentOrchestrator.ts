import { useTimelineStore } from '../store/timelineStore';
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
  /** Human-readable planner identity surfaced in UI logs (e.g. 'rule-based-fallback'). */
  readonly plannerName?: string;
  generatePlan(prompt: string, state: TimelineState): Promise<AgentPlanStep[]>;
}

export interface AgentToolSchema {
  name: string;
  description: string;
  parameters: unknown;
}

/**
 * Exposes the registered timeline tool definitions as a plain LLM
 * function-calling schema list. An external model (IDE agent, Ollama,
 * Claude, GPT) can consume this to plan tool calls, then submit them via
 * the agent bridge (`POST /api/agent/tool`) or the in-app Copilot.
 * The list always mirrors `globalToolRegistry` — no hardcoded copy.
 */
export function getAgentToolSchemas(): AgentToolSchema[] {
  return globalToolRegistry.getAllDefinitions().map((def) => ({
    name: def.name,
    description: def.description,
    parameters: def.parameters,
  }));
}

/**
 * Explicit keyword fallback planner — NOT an LLM and NOT a ReAct reasoner.
 * Matches a small set of editorial intents via substring rules so the
 * in-app Copilot stays usable without a connected model. Any prompt
 * outside these intents yields an empty plan and the orchestrator reports
 * it explicitly instead of pretending to reason.
 */
export class RuleBasedAgentPlanner implements AgentPlanner {
  readonly plannerName = 'rule-based-fallback';
  async generatePlan(prompt: string, state: TimelineState): Promise<AgentPlanStep[]> {
    const lower = prompt.toLowerCase();
    const steps: AgentPlanStep[] = [];

    if (lower.includes('silence') || lower.includes('pause') || lower.includes('tighten') || lower.includes('quiet')) {
      steps.push({
        tool: 'timeline_remove_silence',
        args: {
          threshold_seconds: 0.5,
        },
      });
    } else if (
      lower.includes('vertical') ||
      lower.includes('9:16') ||
      lower.includes('tiktok') ||
      lower.includes('reels') ||
      lower.includes('shorts')
    ) {
      steps.push({
        tool: 'sequence_set_aspect_ratio',
        args: {
          width: 1080,
          height: 1920,
        },
      });
      const videoTrack = state.tracks.find((t) => t.type === 'video') || state.tracks[0];
      if (videoTrack) {
        steps.push({
          tool: 'video_apply_auto_reframe',
          args: {
            track_id: videoTrack.id,
            tracking_mode: 'ActiveSpeaker',
            smoothing: 0.15,
          },
        });
      }
    } else if (lower.includes('caption') || lower.includes('subtitle') || lower.includes('karaoke') || lower.includes('hormozi')) {
      steps.push({
        tool: 'add_subtitles',
        args: {
          style: lower.includes('karaoke') ? 'karaoke_bounce' : 'bold_yellow_highlight',
        },
      });
    } else if (lower.includes('music') || lower.includes('bgm') || lower.includes('soundtrack') || lower.includes('audio track')) {
      steps.push({
        tool: 'add_audio_track',
        args: {
          audio_asset_id: 'bgm_track_1',
          volume: 0.3,
          auto_ducking: true,
        },
      });
    } else if (lower.includes('probe') || lower.includes('metadata') || lower.includes('inspect')) {
      const assetId = state.tracks[0]?.clips[0]?.assetId || 'asset_1';
      steps.push({
        tool: 'probe_media',
        args: {
          asset_id: assetId,
        },
      });
    } else if (lower.includes('cut') || lower.includes('trim') || lower.includes('split') || lower.includes('edit')) {
      steps.push({
        tool: 'cut_and_arrange_timeline',
        args: {
          track_id: state.tracks[0]?.id || 'v1',
          edits: [{ asset_id: 'asset_1', start_time: 0, end_time: 5.0, timeline_position: 0 }],
        },
      });
    }

    return steps;
  }
}

export class AgentOrchestratorService {
  /**
   * Autonomous ReAct Agent Execution Loop
   */
  async processPrompt(
    prompt: string,
    onLog: (log: AgentStepLog) => void,
    planner?: AgentPlanner
  ): Promise<Command[]> {
    onLog({ type: 'user', message: prompt });

    const state = useTimelineStore.getState();
    const activePlanner = planner || new RuleBasedAgentPlanner();

    onLog({
      type: 'thought',
      message: `Evaluating user intent for prompt: "${prompt}" via ${activePlanner.plannerName || 'unnamed planner'}...`,
    });

    const plan = await activePlanner.generatePlan(prompt, state);

    if (plan.length === 0) {
      const availableTools = getAgentToolSchemas()
        .map((s) => s.name)
        .join(', ');
      onLog({
        type: 'response',
        message:
          `No matching editorial intent found for "${prompt}" ` +
          `(${activePlanner.plannerName || 'unnamed planner'}). ` +
          `No timeline mutations made. ` +
          `Available tools: ${availableTools || 'none registered'}. ` +
          `Connect an external model via the agent bridge for open-ended prompts.`,
      });
      return [];
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
        throw new Error(`Tool execution failed: ${result.error}`);
      }

      onLog({
        type: 'tool',
        message: `${step.tool}() -> Success.`,
      });

      // Extract command(s) from tool result
      if (result && typeof (result as any).apply === 'function') {
        executedCommands.push(result as Command);
      } else if (Array.isArray(result) && result.every((r) => r && typeof r.apply === 'function')) {
        executedCommands.push(...result);
      } else if (result && typeof result === 'object' && Array.isArray((result as any).commands)) {
        for (const cmd of (result as any).commands) {
          if (cmd && typeof cmd.apply === 'function') {
            executedCommands.push(cmd);
          }
        }
      }
    }

    onLog({
      type: 'response',
      message: `Successfully planned and executed agent plan with ${plan.length} steps (${executedCommands.length} timeline actions).`,
    });

    return executedCommands;
  }
}

export const agentOrchestrator = new AgentOrchestratorService();
