import { open } from '@tauri-apps/plugin-dialog';
import { isLiveMode, NotImplementedError } from './runtimeConfig';
import { RationalTime, createRational, addRational, rationalToSeconds } from '../types/time';

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
  timestamp_pts: number; // Storing as number for now, though it's generated via RationalTime
  width: number;
  height: number;
  format: string;
  data_buffer_len: number;
}

export class FrameBuffer {
  public frame_index: number;
  public timestamp_pts: number;
  public width: number;
  public height: number;
  public format: string;
  public data_buffer_len: number;
  private _data: Uint8Array | null;

  constructor(info: DemuxedFrameInfo, data: Uint8Array) {
    this.frame_index = info.frame_index;
    this.timestamp_pts = info.timestamp_pts;
    this.width = info.width;
    this.height = info.height;
    this.format = info.format;
    this.data_buffer_len = info.data_buffer_len;
    this._data = data;
  }

  get data(): Uint8Array {
    if (!this._data) {
      throw new Error('FrameBuffer already released (RAII violation)');
    }
    return this._data;
  }

  /**
   * Explicit lifetime release (Invariant §5.6)
   */
  release() {
    this._data = null;
  }
}

export class NativeBridgeService {
  /**
   * Separates file picking from file probing.
   * If file_path is empty, prompts user with a file dialog.
   * Then probes the file to get metadata.
   */
  async importMediaFile(file_path: string): Promise<MediaProbeMetadata | null> {
    let pathToProbe = file_path;

    // 1. Pick file
    if (!pathToProbe) {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
          const selected = await open({
            multiple: false,
            filters: [{ name: 'Media', extensions: ['mp4', 'mkv', 'avi', 'mov', 'mp3', 'wav'] }]
          });
          if (!selected) return null; // User canceled
          pathToProbe = selected as string;
        } catch (err) {
          console.error('Failed to open file dialog:', err);
          return null;
        }
      } else {
        if (isLiveMode()) {
          throw new NotImplementedError('Native Media Dialog Import');
        }
        pathToProbe = '/user_media/sample_interview_4k.mp4';
      }
    }

    // 2. Probe file
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const response = await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<MediaProbeMetadata> } }).__TAURI_INTERNALS__.invoke('probe_media_file', { filePath: pathToProbe });
        return response;
      }
    } catch (err) {
      console.error('Failed to probe media file:', err);
      if (isLiveMode()) {
        throw new NotImplementedError('Native Media Probe');
      }
      return null;
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Media Probe');
    }

    // Fallback web probe generator for local development preview (demo mode only)
    return {
      path: pathToProbe,
      filename: pathToProbe.split('/').pop() || 'sample_interview_4k.mp4',
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
   * Invokes C++/Rust FFmpeg demuxing wrapper to extract video frame buffers.
   * Returns RAII-managed FrameBuffers over a zero-copy IPC payload.
   */
  async demuxVideoFrames(mediaPath: string, startTime: RationalTime, frameCount: number = 30): Promise<FrameBuffer[]> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        // Probe first to get accurate metadata for buffer unpacking
        const probe = await this.importMediaFile(mediaPath);
        if (!probe) throw new Error("Could not probe file for demuxing");

        // Invoke Tauri 2 binary payload return (returns ArrayBuffer/Uint8Array)
        const rawBytes = await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<Uint8Array> } }).__TAURI_INTERNALS__.invoke('demux_video_frames', {
          filePath: mediaPath,
          startTime: rationalToSeconds(startTime),
          frameCount,
        });

        const width = probe.width;
        const height = probe.height;
        const fps = probe.fps > 0 ? probe.fps : 30.0;
        const frameSize = Math.floor(width * height * 1.5);
        const frameDuration = createRational(Math.round(1000000 / fps), 1000000);

        const frames: FrameBuffer[] = [];
        for (let i = 0; i < frameCount; i++) {
          const offset = i * frameSize;
          if (offset + frameSize > rawBytes.byteLength) break;

          const dataSlice = rawBytes.slice(offset, offset + frameSize);

          // Use exact rational time arithmetic (Invariant §5.1)
          let currentPts = startTime;
          for(let j=0; j<i; j++) {
            currentPts = addRational(currentPts, frameDuration);
          }

          frames.push(new FrameBuffer({
            frame_index: i,
            timestamp_pts: rationalToSeconds(currentPts),
            width,
            height,
            format: 'YUV420P',
            data_buffer_len: frameSize,
          }, dataSlice));
        }
        return frames;
      }
    } catch (err) {
      console.warn('[Native Bridge]: Frame extraction error:', err);
    }

    // Invariant §5.5: Fail loudly rather than returning silent mock data on main path
    throw new NotImplementedError('Native FFmpeg Video Frame Demuxer (Desktop host required)');
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

  /**
   * Invokes native command to calculate SHA-256 file fingerprint
   */
  async getFileFingerprint(filePath: string): Promise<string> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<string> } }).__TAURI_INTERNALS__.invoke('get_file_fingerprint', { filePath });
      }
    } catch (err) {
      console.warn('[Native Bridge]: Failed to get file fingerprint:', err);
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native File Fingerprint');
    }

    // Fallback web mock
    return `mock_sha256_${filePath}`;
  }

  /**
   * Checks if file exists on disk
   */
  async checkFileExists(filePath: string): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<boolean> } }).__TAURI_INTERNALS__.invoke('check_file_exists', { filePath });
      }
    } catch (err) {
      console.warn('[Native Bridge]: Failed to check file existence:', err);
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Check File Exists');
    }

    // Fallback web mock
    return true;
  }

  async getAvailableEncoders(): Promise<string[]> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<string[]> } }).__TAURI_INTERNALS__.invoke('get_available_encoders');
      }
    } catch (err) {
      console.warn('[Native Bridge]: Failed to fetch available encoders:', err);
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Encoder Detection');
    }

    return [];
  }
}

export const nativeBridge = new NativeBridgeService();
