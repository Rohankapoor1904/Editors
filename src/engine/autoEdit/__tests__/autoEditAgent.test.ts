import { describe, it, expect, vi, beforeEach } from 'vitest';
import { globalToolRegistry } from '../../../services/tools/registry';
import '../../../services/tools/index';
import { RuleBasedAgentPlanner } from '../../../services/agentOrchestrator';
import { useMediaPoolStore } from '../../../store/mediaPool';
import { useTimelineStore } from '../../../store/timelineStore';
import { whisperService } from '../../../services/whisperTranscriber';
import { sileroVadService } from '../../../services/sileroVad';
import { createRational } from '../../../types/time';

function seedStores() {
  useMediaPoolStore.setState({
    assets: [
      {
        id: 'a1', name: 'Take1.mp4', path: 'blob:take1', type: 'video',
        duration: '240/24', fingerprint: 'fp1', isOffline: false,
      },
    ],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1', type: 'video', index: 0, name: 'V1',
        muted: false, locked: false, solo: false, height: 64, clips: [],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(0, 1),
    markers: [],
    comments: [],
  });
}

describe('R25.1 — auto_edit_assembly tool wiring', () => {
  beforeEach(() => {
    seedStores();
    vi.restoreAllMocks();
  });

  it('is registered with a schema mirroring the live registry', () => {
    const def = globalToolRegistry.getDefinition('auto_edit_assembly');
    expect(def).toBeDefined();
    expect(def?.parameters.required).toContain('asset_ids');
  });

  it('rejects empty, unknown and undurated footage with typed errors', async () => {
    await expect(
      globalToolRegistry.execute('auto_edit_assembly', { asset_ids: [] })
    ).resolves.toHaveProperty('error', 'no_footage');

    await expect(
      globalToolRegistry.execute('auto_edit_assembly', { asset_ids: ['ghost'] })
    ).resolves.toHaveProperty('error', 'unknown_asset');

    useMediaPoolStore.setState({
      assets: [
        {
          id: 'ax', name: 'Mystery.mp4', path: 'blob:x', type: 'video',
          duration: 'n/a', fingerprint: 'fpx', isOffline: false,
        },
      ],
    });
    await expect(
      globalToolRegistry.execute('auto_edit_assembly', { asset_ids: ['ax'] })
    ).resolves.toHaveProperty('error', 'unknown_duration');
  });

  it('assembles keepers through real services and fails honestly without a backend', async () => {
    vi.spyOn(whisperService, 'transcribe').mockResolvedValue({
      fullText: 'hello world test take one',
      words: Array.from({ length: 20 }, (_, i) => ({
        id: `w${i}`, word: `w${i}`, startTime: i * 0.4, endTime: i * 0.4 + 0.3, confidence: 0.9,
      })),
    });
    vi.spyOn(sileroVadService, 'detectSilence').mockResolvedValue([]);

    const result = await globalToolRegistry.execute('auto_edit_assembly', { asset_ids: ['a1'] });
    expect(result).toHaveProperty('success', true);
    expect((result as { kept: number }).kept).toBe(1);
    expect((result as { commands: unknown[] }).commands).toHaveLength(1);

    vi.restoreAllMocks();
    const offline = await globalToolRegistry.execute('auto_edit_assembly', { asset_ids: ['a1'] });
    expect(offline).toHaveProperty('error', 'auto_edit_failed');
  });
});

describe('R25.1 — planner routes assembly requests to real footage', () => {
  beforeEach(() => {
    seedStores();
  });

  it('maps auto-edit phrasing onto the assembly tool (ahead of the cut branch)', async () => {
    const planner = new RuleBasedAgentPlanner();
    const state = useTimelineStore.getState();
    const steps = await planner.generatePlan('auto edit my footage into a rough cut', state);
    expect(steps).toHaveLength(1);
    expect(steps[0].tool).toBe('auto_edit_assembly');
    expect((steps[0].args as { asset_ids: string[] }).asset_ids).toContain('a1');
  });
});
