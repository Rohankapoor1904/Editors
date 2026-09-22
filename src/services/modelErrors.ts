/**
 * Missing-model error guidance (R22.2).
 *
 * The Whisper / Silero ONNX files are tracked in-repo but only resolve in
 * certain working directories; installed builds rely on
 * `bundle.resources`. When the backend reports a missing model, the raw
 * message names the file but not where it should live — this module turns
 * it into actionable guidance. No URLs are invented here: the Whisper
 * download link is the one already emitted by `whisper_onnx.rs`.
 */

export type MissingModel = 'whisper' | 'silero-vad';

export function detectMissingModel(message: string): MissingModel | null {
  if (/ggml-tiny\.en\.bin/i.test(message)) return 'whisper';
  if (/silero_vad\.onnx/i.test(message)) return 'silero-vad';
  return null;
}

export function isModelMissingError(message: string): boolean {
  return detectMissingModel(message) !== null;
}

export function modelMissingGuidance(model: MissingModel): string {
  if (model === 'whisper') {
    return (
      'Whisper model (ggml-tiny.en.bin) not found. ' +
      'Dev: place it at src-tauri/ggml-tiny.en.bin or next to the app binary. ' +
      'Download: https://huggingface.co/ggerganov/whisper.cpp. ' +
      'Installed builds ship it via bundle.resources.'
    );
  }
  return (
    'Silero VAD model (models/silero_vad.onnx) not found. ' +
    'Dev: ensure models/silero_vad.onnx exists relative to the src-tauri directory. ' +
    'Installed builds ship it via bundle.resources.'
  );
}

/**
 * Appends missing-model guidance to a backend error message.
 * Non-model errors pass through untouched.
 */
export function formatModelError(rawMessage: string): string {
  const model = detectMissingModel(rawMessage);
  if (!model) return rawMessage;
  if (rawMessage.includes('bundle.resources')) return rawMessage;
  return `${rawMessage} — ${modelMissingGuidance(model)}`;
}
