export interface TimelineClipExport {
  assetPath: string;
  sourceIn: number;
  duration: number;
  startOffset: number;
  isAudio: boolean;
}

export interface ExportConfig {
  presetName: string;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  encoder: 'NVENC (NVIDIA)' | 'VideoToolbox (Apple)' | 'QuickSync (Intel)' | 'AMF (AMD)' | 'Software x264' | string;
  outputPath: string;
  targetLufs?: number;
  colorSpace?: 'bt709' | 'bt2020' | string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | string;
  clips?: TimelineClipExport[];
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
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { rationalToSeconds } from '../types/time';

export class HardwareExportEngine {
  /**
   * Generates FFmpeg command-line flags for specified hardware video encoder
   */
  buildFFmpegCommand(config: ExportPresetConfig): NativeFFmpegCommand {
    const args: string[] = ['-y'];

    // Video encoder codec selection
    if (config.encoder === 'NVENC (NVIDIA)') {
      args.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20', '-rc:v', 'vbr');
    } else if (config.encoder === 'VideoToolbox (Apple)') {
      args.push('-c:v', 'h264_videotoolbox', '-realtime', '1');
    } else if (config.encoder === 'QuickSync (Intel)') {
      args.push('-c:v', 'h264_qsv', '-global_quality', '20');
    } else if (config.encoder === 'AMF (AMD)') {
      args.push('-c:v', 'h264_amf', '-quality', 'speed');
    } else {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18');
    }

    // Resolution and FPS
    args.push('-s', `${config.width}x${config.height}`);
    args.push('-r', `${config.fps}`);

    // Bitrate
    args.push('-b:v', `${config.bitrateMbps}M`, '-maxrate', `${config.bitrateMbps * 1.5}M`, '-bufsize', `${config.bitrateMbps * 2}M`);

    // Colorimetry metadata tagging (Rec.709 or BT.2020)
    if (config.colorSpace === 'bt2020') {
      args.push('-colorspace', 'bt2020nc', '-color_primaries', 'bt2020', '-color_trc', 'smpte2084');
    } else {
      args.push('-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709');
    }

    // Audio loudness normalization (Roadmap R18.2)
    if (typeof config.targetLufs === 'number') {
      args.push('-af', `loudnorm=I=${config.targetLufs}:TP=-1.5:LRA=11`);
    }

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

        let clipsToExport = config.clips;
        if (!clipsToExport || clipsToExport.length === 0) {
          try {
            const tracks = useTimelineStore.getState().tracks;
            const assets = useMediaPoolStore.getState().assets;
            const extracted: TimelineClipExport[] = [];

            for (const track of tracks) {
              if (track.muted) continue;
              for (const clip of track.clips) {
                const asset = assets.find((a) => a.id === clip.assetId);
                if (asset && asset.path) {
                  extracted.push({
                    assetPath: asset.path,
                    sourceIn: rationalToSeconds(clip.sourceIn),
                    duration: rationalToSeconds(clip.duration),
                    startOffset: rationalToSeconds(clip.startOffset),
                    isAudio: track.type === 'audio',
                  });
                }
              }
            }
            if (extracted.length > 0) {
              clipsToExport = extracted;
            }
          } catch (err) {
            console.warn('[Export Engine]: Could not resolve timeline clips:', err);
          }
        }

        const taskId = await invoke('start_export_task', { config: {
            preset_name: config.presetName,
            width: config.width,
            height: config.height,
            fps: config.fps,
            bitrate_mbps: config.bitrateMbps,
            encoder: config.encoder,
            output_path: config.outputPath,
            target_lufs: config.targetLufs ?? -14.0,
            color_space: config.colorSpace ?? 'bt709',
            clips: clipsToExport?.map((c) => ({
              asset_path: c.assetPath,
              source_in: c.sourceIn,
              duration: c.duration,
              start_offset: c.startOffset,
              is_audio: c.isAudio,
            })),
          }
        });

        let isPolling = true;
        let lastPercent = -1;
        while (isPolling) {
          const progress: ExportProgress = await invoke('poll_export_task', { id: taskId, lastPercent });
          if (progress.status === 'processing') {
            onProgress(progress.percent);
            lastPercent = progress.percent;
          } else if (progress.status === 'done') {
            onProgress(100);
            isPolling = false;
            return true;
          } else if (progress.status === 'failed') {
            isPolling = false;
            throw new Error(progress.error || 'Export failed');
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
