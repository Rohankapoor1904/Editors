import { isLiveMode, NotImplementedError } from './runtimeConfig';

export interface SilenceSegment {
  startTime: number; // in seconds
  endTime: number;   // in seconds
  duration: number;  // in seconds
}

export class SileroVadService {
  /**
   * Evaluates speech probability P_speech(t) over 32ms audio frames to locate silent gaps
   */
  async detectSilence(
    audioPath: string,
    minSilenceDurationSeconds = 0.5,
    silenceThresholdDb = -35.0
  ): Promise<SilenceSegment[]> {
    console.log(`[Silero VAD Engine]: Detecting silent gaps > ${minSilenceDurationSeconds}s in "${audioPath}"...`);

    try {
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const nativeRes = await (window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (cmd: string, args?: Record<string, unknown>) => Promise<{
              start_time: number;
              end_time: number;
              duration: number;
            }[]>;
          };
        }).__TAURI_INTERNALS__.invoke('detect_vad_silence', {
          audioPath,
          minDuration: minSilenceDurationSeconds,
          thresholdDb: silenceThresholdDb,
        });

        return nativeRes.map((s) => ({
          startTime: s.start_time,
          endTime: s.end_time,
          duration: s.duration,
        }));
      }
    } catch (err) {
      console.warn('[Silero VAD Engine]: Falling back to client-side VAD engine:', err);
    }

    if (isLiveMode()) {
      throw new NotImplementedError('Silero VAD Silence Detection Engine');
    }

    // Mock VAD output for local preview (demo mode only)
    return [
      { startTime: 5.0, endTime: 7.5, duration: 2.5 },
      { startTime: 18.2, endTime: 19.8, duration: 1.6 },
    ];
  }
}

export const sileroVadService = new SileroVadService();
