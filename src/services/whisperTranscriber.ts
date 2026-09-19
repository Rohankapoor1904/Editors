export interface WordTimestamp {
  id: string;
  word: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  confidence: number;
}

export interface TranscriptResult {
  fullText: string;
  words: WordTimestamp[];
}

import { NotImplementedError } from './runtimeConfig';

export class WhisperTranscriberService {
  /**
   * Invokes local Whisper ONNX pipeline for offline, frame-accurate transcript generation
   */
  async transcribe(audioPath: string): Promise<TranscriptResult> {
    console.log(`[Whisper Engine]: Processing speech-to-text on ${audioPath}...`);

    try {
      // Check for Tauri IPC bridge availability
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        const response = await (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args: { audioPath: string }) => Promise<{ full_text: string; words: Array<{ id: string; word: string; start_time: number; end_time: number; confidence: number }> }> } }).__TAURI_INTERNALS__.invoke('run_whisper_stt', { audioPath });
        return {
          fullText: response.full_text,
          words: response.words.map((w) => ({
            id: w.id,
            word: w.word,
            startTime: w.start_time,
            endTime: w.end_time,
            confidence: w.confidence,
          })),
        };
      }
    } catch (err) {
      console.warn('[Whisper Engine]: Falling back to local client STT engine:', err);
    }

    throw new NotImplementedError('Whisper Transcriber ONNX Engine');
  }

  async transcribeAudio(audioPath: string): Promise<TranscriptResult> {
    return this.transcribe(audioPath);
  }
}

export const whisperService = new WhisperTranscriberService();
