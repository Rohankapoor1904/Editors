import { isLiveMode, NotImplementedError } from './runtimeConfig';

export interface MediaProbeMetadata {
  path: string;
  filename: string;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  hasAudio: boolean;
  sampleRate?: number;
}

export interface DemuxedFrameInfo {
  frame_index: number;
  timestamp_pts: number;
  width: number;
  height: number;
  format: string;
  data_buffer_len: number;
}

export class NativeBridgeService {
  /**
   * Invokes native open file dialog via Tauri 2.0 IPC or fallback web file API
   */
  async importMediaFile(): Promise<MediaProbeMetadata | null> {
    try {
      // Check if running inside Tauri 2.0 desktop shell
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        // Native Tauri IPC invocation
        const response = await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<MediaProbeMetadata> } }).__TAURI_INTERNALS__.invoke('open_media_file_dialog');
        return response;
      }
    } catch (err) {
      console.error('Failed to import media file:', err);
      if (isLiveMode()) {
        throw new NotImplementedError('Native Media Dialog Import');
      }
      return null;
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Media Probe & File Dialog');
    }

    // Fallback web probe generator for local development preview (demo mode only)
    return {
      path: '/user_media/sample_interview_4k.mp4',
      filename: 'sample_interview_4k.mp4',
      durationSeconds: 42.8,
      width: 3840,
      height: 2160,
      fps: 59.94,
      codec: 'h264',
      hasAudio: true,
      sampleRate: 48000,
    };
  }

  /**
   * Invokes C++/Rust FFmpeg demuxing wrapper to extract video frame buffers
   */
  async demuxVideoFrames(mediaPath: string, startTimeSeconds: number = 0, frameCount: number = 30): Promise<DemuxedFrameInfo[]> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<DemuxedFrameInfo[]> } }).__TAURI_INTERNALS__.invoke('demux_video_frames', {
          filePath: mediaPath,
          startTime: startTimeSeconds,
          frameCount,
        });
      }
    } catch (err) {
      console.warn('[Native Bridge]: Falling back to web demuxer mock:', err);
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native FFmpeg Video Frame Demuxer');
    }

    // Web preview fallback (demo mode only)
    const frameDuration = 1 / 59.94;
    return Array.from({ length: frameCount }, (_, i) => ({
      frame_index: i,
      timestamp_pts: startTimeSeconds + i * frameDuration,
      width: 3840,
      height: 2160,
      format: 'YUV420P',
      data_buffer_len: 3840 * 2160 * 1.5,
    }));
  }

  /**
   * Triggers C++/Rust FFmpeg demuxing engine for background proxy generation
   */
  async generateProxy(mediaPath: string): Promise<string> {
    console.log(`[Native Bridge]: Generating H.264 low-res proxy for ${mediaPath}...`);
    if (isLiveMode()) {
      throw new NotImplementedError('Native Proxy Generation');
    }
    return `${mediaPath}.proxy.mp4`;
  }
}

export const nativeBridge = new NativeBridgeService();
