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
});
