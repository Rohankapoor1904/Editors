import { describe, it, expect, beforeEach } from 'vitest';
import {
  agentOrchestrator,
  RuleBasedAgentPlanner,
  getAgentToolSchemas,
  AgentPlanner,
  AgentStepLog,
} from '../agentOrchestrator';
import { globalToolRegistry } from '../tools/registry';
import { useTimelineStore } from '../../store/timelineStore';
import { setRuntimeMode } from '../runtimeConfig';
import { secondsToRational } from '../../types/time';
import { TimelineState } from '../../types/timeline';

function seedStore() {
  setRuntimeMode('live');
  useTimelineStore.setState({
    past: [],
    future: [],
    metadata: {
      name: 'Planner Honesty Fixture',
      fps: 30,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      colorSpace: 'rec709',
    },
    tracks: [
      {
        id: 'v1',
        type: 'video',
        index: 0,
        name: 'V1 - Main Video',
        muted: false,
        locked: false,
        solo: false,
        height: 64,
        clips: [
          {
            id: 'clip_v1',
            assetId: 'asset_cam_1',
            name: 'Interview_AngleA.mp4',
            startOffset: secondsToRational(0, 30),
            duration: secondsToRational(10, 30),
            sourceIn: secondsToRational(0, 30),
            sourceOut: secondsToRational(10, 30),
          },
        ],
      },
    ],
  });
}

describe('R21.2: planner honesty + LLM tool-schema exposure', () => {
  beforeEach(seedStore);

  it('labels the keyword planner as an explicit fallback, not a reasoner', () => {
    const planner = new RuleBasedAgentPlanner();
    expect(planner.plannerName).toBe('rule-based-fallback');
  });

  it('exposes a tool-schema list that mirrors the live registry (no hardcoded copy)', () => {
    const schemas = getAgentToolSchemas();
    const registered = globalToolRegistry.getAllDefinitions().map((d) => d.name);
    expect(schemas.map((s) => s.name).sort()).toEqual([...registered].sort());
    expect(schemas.length).toBeGreaterThan(0);
    for (const schema of schemas) {
      expect(typeof schema.name).toBe('string');
      expect(typeof schema.description).toBe('string');
      expect(schema.parameters).toBeDefined();
    }
    expect(schemas.map((s) => s.name)).toContain('timeline_remove_silence');
    expect(schemas.map((s) => s.name)).toContain('sequence_set_aspect_ratio');
  });

  it('reports unknown intents explicitly with zero mutations', async () => {
    const logs: AgentStepLog[] = [];
    const commands = await agentOrchestrator.processPrompt(
      'flibbertigibbet quantum zanzibar',
      (log) => logs.push(log)
    );

    expect(commands).toEqual([]);
    expect(logs.some((l) => l.type === 'user')).toBe(true);
    expect(logs.some((l) => l.type === 'thought')).toBe(true);
    expect(logs.some((l) => l.type === 'tool')).toBe(false);
    const response = logs.find((l) => l.type === 'response');
    expect(response).toBeDefined();
    expect(response!.message).toContain('No matching editorial intent');
    expect(response!.message).toContain('No timeline mutations made');
    expect(response!.message).toContain('timeline_remove_silence');
  });

  it('keeps the documented fallback intents planning', async () => {
    const planner = new RuleBasedAgentPlanner();
    const state = useTimelineStore.getState();

    const silence = await planner.generatePlan('remove pauses and quiet gaps', state);
    expect(silence).toHaveLength(1);
    expect(silence[0].tool).toBe('timeline_remove_silence');

    const vertical = await planner.generatePlan('reframe vertical 9:16 tiktok', state);
    expect(vertical).toHaveLength(2);
    expect(vertical[0].tool).toBe('sequence_set_aspect_ratio');

    const captions = await planner.generatePlan('add karaoke captions please', state);
    expect(captions).toHaveLength(1);
    expect(captions[0].tool).toBe('add_subtitles');

    const music = await planner.generatePlan('add background music soundtrack', state);
    expect(music).toHaveLength(1);
    expect(music[0].tool).toBe('add_audio_track');
  });

  it('accepts an external LLM-style planner through the AgentPlanner interface', async () => {
    const llmPlanner: AgentPlanner = {
      plannerName: 'external-llm-fixture',
      async generatePlan(_prompt: string, _state: TimelineState) {
        return [{ tool: 'sequence_set_aspect_ratio', args: { width: 1080, height: 1920 } }];
      },
    };

    const logs: AgentStepLog[] = [];
    const commands = await agentOrchestrator.processPrompt('make it vertical', (l) => logs.push(l), llmPlanner);

    expect(commands.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.type === 'thought' && l.message.includes('external-llm-fixture'))).toBe(true);
    expect(logs.some((l) => l.type === 'tool' && l.message.includes('sequence_set_aspect_ratio'))).toBe(true);
  });
});
