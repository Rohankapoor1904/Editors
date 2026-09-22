import { describe, it, expect } from 'vitest';
import {
  detectMissingModel,
  isModelMissingError,
  modelMissingGuidance,
  formatModelError,
} from '../modelErrors';

describe('R22.2: missing-model error guidance', () => {
  it('detects the Whisper model from backend error text', () => {
    expect(
      detectMissingModel('Model file ggml-tiny.en.bin not found. Download from https://huggingface.co/ggerganov/whisper.cpp')
    ).toBe('whisper');
    expect(isModelMissingError('failed to load model: ggml-tiny.en.bin missing')).toBe(true);
  });

  it('detects the Silero VAD model from backend error text', () => {
    expect(
      detectMissingModel('Silero VAD ONNX model not found. Checked models/silero_vad.onnx, ../models/silero_vad.onnx')
    ).toBe('silero-vad');
  });

  it('passes non-model errors through untouched', () => {
    expect(detectMissingModel('WAV file must be 16kHz mono')).toBeNull();
    expect(isModelMissingError('ffmpeg exited with code 1')).toBe(false);
    expect(formatModelError('ffmpeg exited with code 1')).toBe('ffmpeg exited with code 1');
  });

  it('whisper guidance names dev locations and the in-repo download source', () => {
    const guidance = modelMissingGuidance('whisper');
    expect(guidance).toContain('ggml-tiny.en.bin');
    expect(guidance).toContain('src-tauri/ggml-tiny.en.bin');
    expect(guidance).toContain('https://huggingface.co/ggerganov/whisper.cpp');
  });

  it('silero guidance names the expected relative path without inventing a URL', () => {
    const guidance = modelMissingGuidance('silero-vad');
    expect(guidance).toContain('models/silero_vad.onnx');
    expect(guidance).not.toContain('http');
  });

  it('formatModelError appends guidance exactly once', () => {
    const raw = 'Silero VAD ONNX model not found. Checked models/silero_vad.onnx';
    const formatted = formatModelError(raw);
    expect(formatted.startsWith(raw)).toBe(true);
    expect(formatted).toContain('bundle.resources');
    expect(formatModelError(formatted)).toBe(formatted);
  });
});
