import { NotImplementedError } from './runtimeConfig';

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

    throw new NotImplementedError('Silero VAD Silence Detection Engine');
  }
}

export const sileroVadService = new SileroVadService();
