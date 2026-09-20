import { describe, it, expect, beforeEach } from 'vitest';
import { agentOrchestrator, RuleBasedAgentPlanner, AgentStepLog } from '../agentOrchestrator';
import { useTimelineStore } from '../../store/timelineStore';
import { setRuntimeMode } from '../runtimeConfig';
import { CompoundCommand } from '../../core/commands/transaction';
import { secondsToRational } from '../../types/time';

describe('Agentic Timeline Copilot & ReAct Reasoning Loop (Task R19.2)', () => {
  beforeEach(() => {
    setRuntimeMode('live');
    useTimelineStore.setState({
      past: [],
      future: [],
      metadata: {
        name: 'Copilot Test Sequence',
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
        {
          id: 'a1',
          type: 'audio',
          index: 1,
          name: 'A1 - Dialogue',
          muted: false,
          locked: false,
          solo: false,
          height: 56,
          clips: [
            {
              id: 'clip_a1',
              assetId: 'asset_cam_1',
              name: 'Interview_Audio.wav',
              startOffset: secondsToRational(0, 30),
              duration: secondsToRational(10, 30),
              sourceIn: secondsToRational(0, 30),
              sourceOut: secondsToRational(10, 30),
            },
          ],
        },
      ],
    });
  });

  it('RuleBasedAgentPlanner generates appropriate tool steps for editorial intents', async () => {
    const planner = new RuleBasedAgentPlanner();
    const state = useTimelineStore.getState();

    // 1. Silence removal
    const silencePlan = await planner.generatePlan('Please remove pauses and cut silence', state);
    expect(silencePlan.length).toBe(1);
    expect(silencePlan[0].tool).toBe('timeline_remove_silence');
    expect(silencePlan[0].args.threshold_seconds).toBe(0.5);

    // 2. Aspect ratio / social reframe
    const reframePlan = await planner.generatePlan('Reframe for 9:16 vertical TikTok reels', state);
    expect(reframePlan.length).toBe(2);
    expect(reframePlan[0].tool).toBe('sequence_set_aspect_ratio');
    expect(reframePlan[0].args.width).toBe(1080);
    expect(reframePlan[0].args.height).toBe(1920);
    expect(reframePlan[1].tool).toBe('video_apply_auto_reframe');
    expect(reframePlan[1].args.track_id).toBe('v1');

    // 3. Captions
    const captionPlan = await planner.generatePlan('Add animated karaoke captions', state);
    expect(captionPlan.length).toBe(1);
    expect(captionPlan[0].tool).toBe('add_subtitles');
    expect(captionPlan[0].args.style).toBe('karaoke_bounce');
  });

  it('orchestrator runs in live mode and emits structured logs to stepper', async () => {
    const logs: AgentStepLog[] = [];

    const commands = await agentOrchestrator.processPrompt(
      'Remove all dead air and silence',
      (log) => logs.push(log)
    );

    // Assert log progression
    expect(logs.some((l) => l.type === 'user')).toBe(true);
    expect(logs.some((l) => l.type === 'thought')).toBe(true);
    expect(logs.some((l) => l.type === 'tool')).toBe(true);
    expect(logs.some((l) => l.type === 'response')).toBe(true);

    // Verify commands returned
    expect(commands.length).toBeGreaterThan(0);
  });

  it('wrapping agent commands in CompoundCommand enables atomic 1-click undo/redo', async () => {
    const logs: AgentStepLog[] = [];

    const commands = await agentOrchestrator.processPrompt(
      'Cut and edit timeline segments',
      (log) => logs.push(log)
    );

    expect(commands.length).toBeGreaterThan(0);

    const store = useTimelineStore.getState();
    const initialClipsCount = store.tracks[0].clips.length;

    // Apply as compound command
    const compound = new CompoundCommand(commands);
    store.executeCommand(compound);

    // Track should now have more clips
    const afterExecute = useTimelineStore.getState();
    expect(afterExecute.tracks[0].clips.length).toBeGreaterThan(initialClipsCount);
    expect(afterExecute.past.length).toBe(1);

    // Single undo restores initial state
    useTimelineStore.getState().undo();
    const afterUndo = useTimelineStore.getState();
    expect(afterUndo.tracks[0].clips.length).toBe(initialClipsCount);
    expect(afterUndo.past.length).toBe(0);
    expect(afterUndo.future.length).toBe(1);

    // Redo reapplies
    useTimelineStore.getState().redo();
    const afterRedo = useTimelineStore.getState();
    expect(afterRedo.tracks[0].clips.length).toBeGreaterThan(initialClipsCount);
  });
});
