import { describe, it, expect } from 'vitest';
import {
  SOCIAL_PRESETS,
  getPresetById,
  buildColorAndAudioFFmpegArgs,
  createExportConfigFromPreset,
} from '../exportPresets';
import { exportEngine } from '../exportEngine';

describe('Social Platform & Broadcast Export Presets (Task R18.2)', () => {
  it('defines all required platform presets with broadcast loudness calibration', () => {
    expect(SOCIAL_PRESETS.length).toBeGreaterThanOrEqual(4);

    const yt = getPresetById('youtube_4k');
    expect(yt).toBeDefined();
    expect(yt?.width).toBe(3840);
    expect(yt?.height).toBe(2160);
    expect(yt?.fps).toBe(59.94);
    expect(yt?.bitrateMbps).toBe(60);
    expect(yt?.targetLufs).toBe(-14.0);
    expect(yt?.colorSpace).toBe('bt709');

    const tiktok = getPresetById('tiktok_reels');
    expect(tiktok).toBeDefined();
    expect(tiktok?.width).toBe(1080);
    expect(tiktok?.height).toBe(1920);
    expect(tiktok?.aspectRatio).toBe('9:16');
    expect(tiktok?.targetLufs).toBe(-14.0);

    const broadcast = getPresetById('broadcast_1080p');
    expect(broadcast).toBeDefined();
    expect(broadcast?.width).toBe(1920);
    expect(broadcast?.height).toBe(1080);
    expect(broadcast?.targetLufs).toBe(-24.0); // Strict EBU R128 standard
  });

  it('builds valid colorimetry tags and ITU-R BS.1770 loudnorm filter', () => {
    const yt = getPresetById('youtube_4k')!;
    const ytArgs = buildColorAndAudioFFmpegArgs(yt);

    expect(ytArgs).toContain('-colorspace');
    expect(ytArgs).toContain('bt709');
    expect(ytArgs).toContain('-color_primaries');
    expect(ytArgs).toContain('bt709');
    expect(ytArgs).toContain('-af');
    expect(ytArgs).toContain('loudnorm=I=-14:TP=-1.5:LRA=11');

    const broadcast = getPresetById('broadcast_1080p')!;
    const bArgs = buildColorAndAudioFFmpegArgs(broadcast);
    expect(bArgs).toContain('loudnorm=I=-24:TP=-1.5:LRA=11');
  });

  it('generates hardware accelerated FFmpeg commands for NVENC, QSV, VideoToolbox, and AMF', () => {
    const yt = getPresetById('youtube_4k')!;

    // Test NVENC
    const nvencConfig = createExportConfigFromPreset(yt, 'NVENC (NVIDIA)');
    const nvencCmd = exportEngine.buildFFmpegCommand(nvencConfig);
    expect(nvencCmd.args).toContain('h264_nvenc');
    expect(nvencCmd.args).toContain('-preset');
    expect(nvencCmd.args).toContain('p4');
    expect(nvencCmd.args).toContain('-colorspace');
    expect(nvencCmd.args).toContain('loudnorm=I=-14:TP=-1.5:LRA=11');

    // Test QuickSync
    const qsvConfig = createExportConfigFromPreset(yt, 'QuickSync (Intel)');
    const qsvCmd = exportEngine.buildFFmpegCommand(qsvConfig);
    expect(qsvCmd.args).toContain('h264_qsv');
    expect(qsvCmd.args).toContain('-global_quality');

    // Test VideoToolbox
    const vtConfig = createExportConfigFromPreset(yt, 'VideoToolbox (Apple)');
    const vtCmd = exportEngine.buildFFmpegCommand(vtConfig);
    expect(vtCmd.args).toContain('h264_videotoolbox');
    expect(vtCmd.args).toContain('-realtime');

    // Test AMF
    const amfConfig = createExportConfigFromPreset(yt, 'AMF (AMD)');
    const amfCmd = exportEngine.buildFFmpegCommand(amfConfig);
    expect(amfCmd.args).toContain('h264_amf');
  });

  it('extracts timeline tracks and clips when calling exportTimeline in desktop environment', async () => {
    const { useTimelineStore } = await import('../../store/timelineStore');
    const { useMediaPoolStore } = await import('../../store/mediaPool');

    const invokedArgs: any[] = [];
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: any) => {
        invokedArgs.push({ cmd, args });
        if (cmd === 'start_export_task') return 'task-123';
        if (cmd === 'poll_export_task') return { status: 'done', percent: 100 };
        return null;
      },
    };

    useMediaPoolStore.setState({
      assets: [
        {
          id: 'asset_1',
          name: 'clip1.mp4',
          path: '/path/to/clip1.mp4',
          duration: '00:00:10',
          type: 'video',
          fingerprint: 'fp1',
          isOffline: false,
        },
      ],
    });

    useTimelineStore.setState({
      tracks: [
        {
          id: 'track_v1',
          name: 'V1',
          type: 'video',
          index: 0,
          muted: false,
          locked: false,
          solo: false,
          height: 64,
          clips: [
            {
              id: 'clip_1',
              assetId: 'asset_1',
              name: 'clip1.mp4',
              startOffset: { value: 0, rate: 30 },
              sourceIn: { value: 15, rate: 30 }, // 0.5s
              sourceOut: { value: 150, rate: 30 },
              duration: { value: 150, rate: 30 }, // 5s
            },
          ],
        },
      ],
    });

    const yt = getPresetById('youtube_4k')!;
    const exportConfig = createExportConfigFromPreset(yt, 'NVENC (NVIDIA)');
    let progressVal = 0;
    const res = await exportEngine.exportTimeline(exportConfig, (p) => {
      progressVal = p;
    });

    expect(res).toBe(true);
    expect(progressVal).toBe(100);
    const startCall = invokedArgs.find((a) => a.cmd === 'start_export_task');
    expect(startCall).toBeDefined();
    expect(startCall.args.config.clips).toBeDefined();
    expect(startCall.args.config.clips.length).toBe(1);
    expect(startCall.args.config.clips[0].asset_path).toBe('/path/to/clip1.mp4');
    expect(startCall.args.config.clips[0].source_in).toBe(0.5);
    expect(startCall.args.config.clips[0].duration).toBe(5);

    delete (window as any).__TAURI_INTERNALS__;
  });
});
