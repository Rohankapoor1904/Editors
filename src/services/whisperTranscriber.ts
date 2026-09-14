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

export class WhisperTranscriberService {
  /**
   * Invokes local Whisper ONNX pipeline for offline, frame-accurate transcript generation
   */
  async transcribeAudio(_audioPath: string): Promise<TranscriptResult> {
    console.log('[Whisper Engine]: Transcribing audio with word-level timestamps...');

    // Mock speech-to-text output for local development
    return {
      fullText: "Welcome to CineCraft AI. This is a tier-1 desktop video editor with autonomous agent features.",
      words: [
        { id: 'w1', word: 'Welcome', startTime: 0.2, endTime: 0.6, confidence: 0.98 },
        { id: 'w2', word: 'to', startTime: 0.65, endTime: 0.8, confidence: 0.99 },
        { id: 'w3', word: 'CineCraft', startTime: 0.85, endTime: 1.4, confidence: 0.95 },
        { id: 'w4', word: 'AI.', startTime: 1.45, endTime: 1.8, confidence: 0.97 },
        { id: 'w5', word: 'This', startTime: 2.2, endTime: 2.4, confidence: 0.99 },
        { id: 'w6', word: 'is', startTime: 2.45, endTime: 2.6, confidence: 0.99 },
        { id: 'w7', word: 'a', startTime: 2.65, endTime: 2.75, confidence: 0.99 },
        { id: 'w8', word: 'tier-1', startTime: 2.8, endTime: 3.2, confidence: 0.96 },
        { id: 'w9', word: 'desktop', startTime: 3.25, endTime: 3.7, confidence: 0.97 },
        { id: 'w10', word: 'video', startTime: 3.75, endTime: 4.1, confidence: 0.99 },
        { id: 'w11', word: 'editor', startTime: 4.15, endTime: 4.6, confidence: 0.98 },
        { id: 'w12', word: 'with', startTime: 4.65, endTime: 4.85, confidence: 0.99 },
        { id: 'w13', word: 'autonomous', startTime: 4.9, endTime: 5.5, confidence: 0.94 },
        { id: 'w14', word: 'agent', startTime: 5.55, endTime: 5.9, confidence: 0.98 },
        { id: 'w15', word: 'features.', startTime: 5.95, endTime: 6.4, confidence: 0.96 },
      ],
    };
  }
}

export const whisperService = new WhisperTranscriberService();
