export interface ExportConfig {
  presetName: 'YouTube 4K' | 'TikTok / Reels (1080x1920)' | 'ProRes 422 HQ' | 'Master Audio AAC';
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  encoder: 'NVENC (NVIDIA)' | 'VideoToolbox (Apple)' | 'QuickSync (Intel)' | 'Software x264';
  outputPath: string;
}

export type ExportPresetConfig = ExportConfig;

export interface NativeFFmpegCommand {
  binary: string;
  args: string[];
}

import { isLiveMode, NotImplementedError } from '../services/runtimeConfig';

export class HardwareExportEngine {
  /**
   * Generates FFmpeg command-line flags for specified hardware video encoder
   */
  buildFFmpegCommand(config: ExportPresetConfig): NativeFFmpegCommand {
    const args: string[] = ['-y'];

    // Video encoder codec selection
    if (config.encoder === 'NVENC (NVIDIA)') {
      args.push('-c:v', 'h264_nvenc', '-preset', 'p6', '-rc:v', 'vbr');
    } else if (config.encoder === 'VideoToolbox (Apple)') {
      args.push('-c:v', 'h264_videotoolbox', '-realtime', '1');
    } else if (config.encoder === 'QuickSync (Intel)') {
      args.push('-c:v', 'h264_qsv', '-global_quality', '20');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18');
    }

    // Resolution and FPS
    args.push('-s', `${config.width}x${config.height}`);
    args.push('-r', `${config.fps}`);

    // Bitrate
    args.push('-b:v', `${config.bitrateMbps}M`, '-maxrate', `${config.bitrateMbps * 1.5}M`, '-bufsize', `${config.bitrateMbps * 2}M`);

    // Audio encoding settings
    args.push('-c:a', 'aac', '-b:a', '320k', '-ar', '48000');

    // Output destination
    args.push(config.outputPath);

    return {
      binary: 'ffmpeg',
      args,
    };
  }

  /**
   * Dispatches render export pipeline using native hardware acceleration
   */
  async exportTimeline(
    config: ExportPresetConfig,
    onProgress: (percent: number) => void
  ): Promise<boolean> {
    console.log(`[Export Engine]: Initiating hardware encode for preset "${config.presetName}"...`);

    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const commandSpec = await (window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<{
              binary: string;
              args: string[];
            }>;
          };
        }).__TAURI_INTERNALS__.invoke('get_export_ffmpeg_command', {
          config: {
            preset_name: config.presetName,
            width: config.width,
            height: config.height,
            fps: config.fps,
            bitrate_mbps: config.bitrateMbps,
            encoder: config.encoder,
            output_path: config.outputPath,
          },
        });

        console.log('[Export Engine Native Command]:', commandSpec.binary, commandSpec.args.join(' '));
      }
    } catch (err) {
      console.warn('[Export Engine]: Native hardware export fallback:', err);
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Hardware Export Render Engine');
    }

    // Simulate hardware encoding progress loop (demo mode only)
    for (let percent = 0; percent <= 100; percent += 10) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      onProgress(percent);
    }

    console.log(`[Export Engine]: Successfully rendered video to ${config.outputPath}`);
    return true;
  }

  async renderSequence(
    config: ExportPresetConfig,
    onProgress: (percent: number) => void
  ): Promise<boolean> {
    return this.exportTimeline(config, onProgress);
  }
}

export const exportEngine = new HardwareExportEngine();
