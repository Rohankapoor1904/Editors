import { readFile } from '@tauri-apps/plugin-fs';
import { isTauriEnvironment } from './projectPersistence';
import { bandLevelsDb } from '../engine/dialogueMatcher';

/**
 * R24.3 remainder — honest media-to-samples bridge for spectrum analysis.
 *
 * Web/imported media arrives as blob: or http(s): URLs (fetchable);
 * desktop media arrives as native paths (Tauri fs-readable). Anything else
 * — or a host without a WebAudio decoder — raises a typed error naming the
 * limitation instead of returning fabricated spectra. No mocks on this path.
 */

export async function fetchAssetBytes(source: string): Promise<ArrayBuffer> {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('audioAnalyze: media source must be a non-empty string');
  }
  if (source.startsWith('blob:') || source.startsWith('http://') || source.startsWith('https://')) {
    let res: Response;
    try {
      res = await fetch(source);
    } catch (err) {
      throw new Error(`audioAnalyze: fetch failed for media source (${(err as Error).message})`);
    }
    if (!res.ok) {
      throw new Error(`audioAnalyze: fetch failed for media source (HTTP ${res.status})`);
    }
    return await res.arrayBuffer();
  }
  if (isTauriEnvironment()) {
    try {
      const data = await readFile(source);
      return data.slice().buffer as ArrayBuffer;
    } catch (err) {
      throw new Error(`audioAnalyze: cannot read media file (${(err as Error).message})`);
    }
  }
  throw new Error(
    'audioAnalyze: native file paths need the Tauri host — import media via the web picker (blob URL) instead'
  );
}

export interface DecodedMono {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * Decodes compressed audio to mono float samples. Requires a WebAudio
 * decoder on the host; jsdom/Node test rigs have none and get an explicit
 * error (asserted by test) rather than silence.
 */
export async function decodeToMono(bytes: ArrayBuffer): Promise<DecodedMono> {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
    throw new Error('audioAnalyze: need a non-empty ArrayBuffer to decode');
  }
  const w = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined;
  const Offline = w?.OfflineAudioContext as unknown as
    | { new (options: OfflineAudioContextOptions): OfflineAudioContext }
    | undefined;
  const Online = (w?.AudioContext ?? w?.webkitAudioContext) as unknown as
    | { new (): AudioContext }
    | undefined;
  if (!Offline && !Online) {
    throw new Error('audioAnalyze: no WebAudio decoder on this host (AudioContext and OfflineAudioContext both absent)');
  }
  const ctx = Offline
    ? new Offline({ numberOfChannels: 2, length: 44100, sampleRate: 44100 })
    : new Online!();
  const canClose = !Offline;
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(bytes.slice(0));
  } catch (err) {
    throw new Error(`audioAnalyze: decode failed (${(err as Error).message})`);
  } finally {
    if (canClose && typeof (ctx as AudioContext).close === 'function') {
      try {
        await (ctx as AudioContext).close();
      } catch {
        // Teardown failure must not mask a successful decode.
      }
    }
  }
  if (audioBuffer.length === 0) {
    throw new Error('audioAnalyze: decoded zero audio frames');
  }
  const mixed = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < mixed.length; i++) {
      mixed[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  return { samples: mixed, sampleRate: audioBuffer.sampleRate };
}

/** End-to-end: fetch → decode → mono → per-band dBFS levels. */
export async function analyzeClipBands(source: string, centersHz: number[]): Promise<number[]> {
  const bytes = await fetchAssetBytes(source);
  const { samples, sampleRate } = await decodeToMono(bytes);
  return bandLevelsDb(samples, sampleRate, centersHz);
}
