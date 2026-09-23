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
  // R26.4: pro-format display label and raw pixel format
  codecDisplay?: string;
  pixFmt?: string;
  hasAudio: boolean;
  sampleRate?: number;
  thumbnailDataUrl?: string;
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
  private probeCache = new Map<string, MediaProbeMetadata>();

  /**
   * Probes a media file for resolution, duration, FPS, and codec.
   * If selectedPath is not provided, opens the OS file picker.
   */
  async importMediaFile(selectedPath?: string): Promise<MediaProbeMetadata | null> {
    let pathToProbe = selectedPath;

    // 1. File Dialog if path not provided
    if (!pathToProbe) {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
          const selected = await open({
            multiple: false,
            filters: [{ name: 'Media', extensions: ['mp4', 'mkv', 'avi', 'mov', 'mp3', 'wav'] }]
          });
          if (!selected) return null;
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

    if (pathToProbe && this.probeCache.has(pathToProbe)) {
      return this.probeCache.get(pathToProbe)!;
    }

    // 2. Probe file
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const response = await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<MediaProbeMetadata> } }).__TAURI_INTERNALS__.invoke('probe_media_file', { filePath: pathToProbe });
        if (response && pathToProbe) {
          this.probeCache.set(pathToProbe, response);
        }
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
    const fallbackMeta: MediaProbeMetadata = {
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
    if (pathToProbe) {
      this.probeCache.set(pathToProbe, fallbackMeta);
    }
    return fallbackMeta;
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
        const rawPayload = await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<Uint8Array | ArrayBuffer> } }).__TAURI_INTERNALS__.invoke('demux_video_frames', {
          filePath: mediaPath,
          startTime: rationalToSeconds(startTime),
          frameCount,
        });

        const rawBytes = rawPayload instanceof Uint8Array ? rawPayload : new Uint8Array(rawPayload);

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
   * Triggers Rust FFmpeg demuxing engine for background proxy generation
   */
  async generateProxy(mediaPath: string, targetHeight: number = 720, codec: string = 'h264'): Promise<string> {
    console.log(`[Native Bridge]: Generating ${codec} proxy for ${mediaPath}...`);
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<string> } }).__TAURI_INTERNALS__.invoke(
          'generate_proxy_video',
          { inputPath: mediaPath, targetHeight, codec }
        );
      }
    } catch (err) {
      console.warn('[Native Bridge]: Proxy generation invoke failed:', err);
      throw err;
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Proxy Generation');
    }
    return `${mediaPath}.proxy.mp4`;
  }

  /**
   * Polls native proxy generation status
   */
  async pollProxy(taskId: string): Promise<{ taskId: string; status: string; percent: number; outputPath?: string; error?: string }> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<{ taskId: string; status: string; percent: number; outputPath?: string; error?: string }> } }).__TAURI_INTERNALS__.invoke(
          'poll_proxy_generation',
          { taskId }
        );
      }
    } catch (err) {
      console.warn('[Native Bridge]: Proxy polling invoke failed:', err);
      throw err;
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Proxy Polling');
    }
    return { taskId, status: 'done', percent: 100, outputPath: `${taskId}.proxy.mp4` };
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

  /**
   * Invokes native AI stem separation pipeline to split audio into Vocals and Instrumental files
   */
  async separateAudioStems(
    audioPath: string,
    outputDir?: string
  ): Promise<{ vocalsPath: string; instrumentalPath: string }> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<{ vocals_path: string; instrumental_path: string }>
          }
        }).__TAURI_INTERNALS__.invoke('separate_audio_stems', { audioPath, outputDir })
          .then(res => ({
            vocalsPath: res.vocals_path,
            instrumentalPath: res.instrumental_path,
          }));
      }
    } catch (err) {
      console.warn('[Native Bridge]: Stem separation invoke failed:', err);
      throw err;
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native AI Stem Separation (Desktop host required)');
    }

    const stem = audioPath.replace(/\.[^/.]+$/, '');
    return {
      vocalsPath: `${stem}_vocals.wav`,
      instrumentalPath: `${stem}_instrumental.wav`,
    };
  }

  /**
   * Invokes native FFmpeg/neural filter to perform voice isolation and AGC dialogue leveling
   */
  async denoiseAudioFile(
    audioPath: string,
    strength: number = 0.75,
    levelerEnabled: boolean = true,
    outputPath?: string
  ): Promise<{ outputPath: string; snrImprovementDb: number }> {
    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        return await (window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<{ output_path: string; snr_improvement_db: number }>
          }
        }).__TAURI_INTERNALS__.invoke('denoise_audio_file', {
          audioPath,
          outputPath,
          strength,
          levelerEnabled,
        }).then(res => ({
          outputPath: res.output_path,
          snrImprovementDb: res.snr_improvement_db,
        }));
      }
    } catch (err) {
      console.warn('[Native Bridge]: Voice denoise invoke failed:', err);
      throw err;
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Native Voice Denoise & Dialogue Leveler (Desktop host required)');
    }

    const stem = audioPath.replace(/\.[^/.]+$/, '');
    return {
      outputPath: `${stem}_isolated.wav`,
      snrImprovementDb: 14.5,
    };
  }

  /**
   * Converts a local disk path to a streaming asset URL via Tauri 2 convertFileSrc
   * or returns the web path/object URL directly.
   */
  getAssetUrl(filePath: string): string {
    if (!filePath) return '';
    if (
      filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('blob:') ||
      filePath.startsWith('data:')
    ) {
      return filePath;
    }
    if (typeof window !== 'undefined' && (window as unknown as { __TAURI_INTERNALS__?: { convertFileSrc?: (path: string) => string } }).__TAURI_INTERNALS__?.convertFileSrc) {
      try {
        return (window as unknown as { __TAURI_INTERNALS__: { convertFileSrc: (path: string) => string } }).__TAURI_INTERNALS__.convertFileSrc(filePath);
      } catch (err) {
        console.warn('[Native Bridge]: convertFileSrc failed:', err);
      }
    }
    return filePath;
  }
}

export const nativeBridge = new NativeBridgeService();
