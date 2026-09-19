export interface ExportConfig {
  presetName: 'YouTube 4K' | 'TikTok / Reels (1080x1920)' | 'ProRes 422 HQ' | 'Master Audio AAC';
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  encoder: 'NVENC (NVIDIA)' | 'VideoToolbox (Apple)' | 'QuickSync (Intel)' | 'Software x264' | string;
  outputPath: string;
}

export type ExportPresetConfig = ExportConfig;

export interface NativeFFmpegCommand {
  binary: string;
  args: string[];
}

export interface ExportProgress {
  status: 'processing' | 'done' | 'failed';
  percent: number;
  error?: string;
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

    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const invoke = (window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<any>;
          };
        }).__TAURI_INTERNALS__.invoke;

        const taskId = await invoke('start_export_task', { config: {
            preset_name: config.presetName,
            width: config.width,
            height: config.height,
            fps: config.fps,
            bitrate_mbps: config.bitrateMbps,
            encoder: config.encoder,
            output_path: config.outputPath,
          }
        });

        let isPolling = true;
        while (isPolling) {
          const progress: ExportProgress = await invoke('poll_export_task', { id: taskId });
          if (progress.status === 'processing') {
            onProgress(progress.percent);
          } else if (progress.status === 'done') {
            onProgress(100);
            isPolling = false;
            return true;
          } else if (progress.status === 'failed') {
            isPolling = false;
            throw new Error(progress.error || 'Export failed');
          }
          if (isPolling) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }
      } catch (err) {
        console.warn('[Export Engine]: Native hardware export failed:', err);
        throw err; // throw instead of silently failing
      }
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Hardware Export Render Engine');
    }

    // In demo mode we fail loudly as well (no faking progress)
    throw new Error('Export not supported in this environment');
  }

  async renderSequence(
    config: ExportPresetConfig,
    onProgress: (percent: number) => void
  ): Promise<boolean> {
    return this.exportTimeline(config, onProgress);
  }
}

export const exportEngine = new HardwareExportEngine();
