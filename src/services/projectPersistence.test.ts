import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveAutosave, loadAutosave } from './projectPersistence';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { setRuntimeMode } from './runtimeConfig';
import * as tauriFs from '@tauri-apps/plugin-fs';

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
  exists: vi.fn().mockResolvedValue(true),
  mkdir: vi.fn(),
  BaseDirectory: { AppData: 1 }
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn()
}));

describe('projectPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMode('live');
    useTimelineStore.setState({ projectId: 'test-id', version: '1.4.0', metadata: { name: 'test', fps: 30, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'sRGB' } });
  });

  it('saves and loads autosave', async () => {
    const state = useTimelineStore.getState();
    const assets = useMediaPoolStore.getState().assets;

    // 1. Initially save autosave
    await saveAutosave(state, assets);
    expect(tauriFs.writeTextFile).toHaveBeenCalled();

    // 2. Mock reading it back
    const mockJsonString = JSON.stringify({
      $schema: "https://editor.standard/v1/project.schema.json",
      project_id: "test-id",
      schema_version: "1.4.0",
      metadata: {
        title: "Test Autosave",
        created_at: new Date().toISOString(),
        modified_at: new Date().toISOString()
      },
      media_pool: [
        {
          asset_id: "dummy",
          name: "dummy.mp4",
          file_path: "/dummy.mp4",
          checksum_sha256: "xxx",
          duration: { value: 1, rate: 1 },
          audio_streams: [{ sample_rate: 48000 }]
        }
      ],
      sequences: [{
        sequence_id: 'seq_main',
        name: 'Master',
        time_base: { value: 1, rate: 30 },
        start_timecode: { value: 0, rate: 1 },
        canvas: { width: 1920, height: 1080, pixel_aspect_ratio: 1.0 },
        video_tracks: [],
        audio_tracks: []
      }]
    });
    vi.mocked(tauriFs.readTextFile).mockResolvedValue(mockJsonString);

    const loaded = await loadAutosave();
    expect(loaded).toBe(true);

    // Assert the store is updated
    expect(useTimelineStore.getState().metadata.name).toBe('Test Autosave');
  });
});
