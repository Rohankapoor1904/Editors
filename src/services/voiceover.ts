import { useMediaPoolStore, MediaAsset } from '../store/mediaPool';

/**
 * R25.3 — voiceover service: system-voice preview/selection, microphone
 * recording into real assets, and take placement. Every capability probes
 * its host API first — missing mic/synth/encoder surfaces a typed error,
 * never a silent no-op.
 *
 * Explicitly NOT here: neural TTS rendering and voice cloning. No
 * segmentation-style stub is shipped for them (no fake `tts.rs`, no
 * phoneme theater): `renderOfflineTts` throws until a model or a labelled
 * service integration lands with its own ADR.
 */

export interface SystemVoice {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
}

interface SpeechHost {
  getVoices: () => { voiceURI: string; name: string; lang: string; localService: boolean }[];
  speak: (utterance: unknown) => void;
  cancel?: () => void;
  Utterance?: { new (text: string): unknown };
}

function speechHost(): SpeechHost | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const synth = w.speechSynthesis as SpeechHost | undefined;
  if (!synth || typeof synth.getVoices !== 'function' || typeof synth.speak !== 'function') return null;
  const Utterance = w.SpeechSynthesisUtterance as SpeechHost['Utterance'];
  return { getVoices: synth.getVoices.bind(synth), speak: synth.speak.bind(synth), Utterance };
}

/** R25.3 — real system voices, or [] where no speech engine exists. */
export function listSystemVoices(): SystemVoice[] {
  const host = speechHost();
  if (!host) return [];
  try {
    return host.getVoices().map((v) => ({
      voiceURI: v.voiceURI,
      name: v.name,
      lang: v.lang,
      localService: v.localService,
    }));
  } catch {
    return [];
  }
}

/** R25.3 — speaks text through a system voice (preview, not an asset). */
export function previewVoice(text: string, voiceURI?: string): void {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('voiceover: preview text must be non-empty');
  }
  const host = speechHost();
  if (!host) {
    throw new Error('voiceover: no system speech engine on this host (speechSynthesis absent)');
  }
  const UtteranceCtor = host.Utterance as unknown as
    | { new (text: string): { voiceURI?: string } }
    | undefined;
  if (!UtteranceCtor) {
    throw new Error('voiceover: speech engine present but utterance construction unavailable');
  }
  const utterance = new UtteranceCtor(text);
  if (voiceURI) utterance.voiceURI = voiceURI;
  host.speak(utterance);
}

export interface RecordedTake {
  blob: Blob;
  objectUrl: string;
  /** Performed duration in seconds, measured wall-clock. */
  durationSec: number;
  mimeType: string;
}

interface MediaRecorderHost {
  stop: () => void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: ((event: { error: Error }) => void) | null;
  state: string;
}

/**
 * R25.3 — records the microphone until stopRecording is called.
 * Returns a controller; stopping resolves the take. Any missing piece
 * (mediaDevices, getUserMedia, MediaRecorder, URL.createObjectURL) throws
 * a typed error naming it.
 */
export function startVoiceRecording(): {
  stopRecording: () => Promise<RecordedTake>;
  cancelRecording: () => void;
} {
  const w = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined;
  const mediaDevices = w?.navigator as unknown as
    | { mediaDevices?: { getUserMedia?: (c: { audio: boolean }) => Promise<unknown> } }
    | undefined;
  const getUserMedia = mediaDevices?.mediaDevices?.getUserMedia?.bind(mediaDevices.mediaDevices);
  const Recorder = w?.MediaRecorder as unknown as
    | { new (stream: unknown, options?: { mimeType?: string }): MediaRecorderHost }
    | undefined;
  const urlApi = w?.URL as unknown as { createObjectURL?: (blob: Blob) => string } | undefined;
  const createObjectURL = urlApi?.createObjectURL?.bind(urlApi);
  if (!getUserMedia) {
    throw new Error('voiceover: microphone unavailable on this host (mediaDevices.getUserMedia absent)');
  }
  if (!Recorder) {
    throw new Error('voiceover: MediaRecorder unavailable on this host');
  }
  if (!createObjectURL) {
    throw new Error('voiceover: URL.createObjectURL unavailable on this host');
  }

  let stream: { getTracks: () => { stop: () => void }[] } | null = null;
  let recorder: MediaRecorderHost | null = null;
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let settled = false;

  const pending = getUserMedia({ audio: true }).then((s) => {
    stream = s as { getTracks: () => { stop: () => void }[] };
    recorder = new Recorder(stream, { mimeType: 'audio/webm' });
    recorder.ondataavailable = (event: { data: Blob }) => {
      if (event.data) chunks.push(event.data);
    };
    recorder.onerror = () => {
      settled = true;
    };
  });

  const teardown = (): void => {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // Best effort: releasing the mic must not mask the take.
    }
    stream = null;
    recorder = null;
  };

  return {
    stopRecording: async (): Promise<RecordedTake> => {
      await pending;
      if (!recorder) throw new Error('voiceover: recorder never started (mic request failed or was cancelled)');
      const durationSec = Math.max(0, (Date.now() - startedAt) / 1000);
      const done = new Promise<RecordedTake>((resolve, reject) => {
        if (!recorder) {
          reject(new Error('voiceover: recorder lost before stop'));
          return;
        }
        recorder.ondataavailable = (event: { data: Blob }) => {
          if (event.data) chunks.push(event.data);
          if (settled) {
            reject(new Error('voiceover: recording errored mid-take'));
            return;
          }
          const blob = new Blob(chunks, { type: 'audio/webm' });
          resolve({
            blob,
            objectUrl: (createObjectURL as (blob: Blob) => string)(blob),
            durationSec,
            mimeType: 'audio/webm',
          });
        };
        try {
          recorder.stop();
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        } finally {
          teardown();
        }
      });
      return done;
    },
    cancelRecording: () => {
      settled = true;
      teardown();
    },
  };
}

/**
 * R25.3 — registers a recorded take as a media-pool asset. Duration is the
 * performed wall-clock length (honest by construction, asserted by test).
 */
export function placeVoiceoverTake(take: RecordedTake, name: string): MediaAsset {
  if (!take || !(take.blob instanceof Blob)) {
    throw new Error('voiceover: take blob is required');
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('voiceover: take name must be non-empty');
  }
  if (!Number.isFinite(take.durationSec) || take.durationSec < 0) {
    throw new Error('voiceover: take duration must be a finite non-negative number');
  }
  const asset: MediaAsset = {
    id: `vo_${Date.now()}`,
    name,
    path: take.objectUrl,
    type: 'audio',
    duration: `00:00:${take.durationSec.toFixed(1)}`,
    badge: 'voiceover',
    fingerprint: `vo-${Date.now()}-${take.blob.size}`,
    isOffline: false,
  };
  useMediaPoolStore.getState().addAsset(asset);
  return asset;
}

/**
 * R25.3 — offline neural TTS entry point. No model is bundled with this
 * build, so this throws in every mode rather than synthesizing robotic
 * phonemes and calling it a voice.
 */
export function renderOfflineTts(): never {
  throw new Error(
    'voiceover: offline neural TTS is unavailable (no model bundled). Preview system voices, or record a take, instead.'
  );
}
