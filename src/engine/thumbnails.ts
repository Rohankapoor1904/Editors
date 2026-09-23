/**
 * Real timeline filmstrip thumbnails.
 *
 * Frames are captured from the asset's own media (video element seek +
 * canvas grab) — never fabricated. Every failure path resolves to `null`
 * (caller renders nothing) instead of inventing pixels. Captures are cached
 * per source so re-renders never re-decode.
 */

export interface FilmstripRequest {
  durationSec: number;
  sourceInSec: number;
  count: number;
}

export interface CaptureOptions {
  /** Per-operation timeout in ms (default 3000). */
  timeoutMs?: number;
  /** Frame width in px, clamped to 48..192 (default 96). */
  widthPx?: number;
  /** Injectable element factory (tests / non-DOM hosts). */
  videoFactory?: () => HTMLVideoElement;
}

/**
 * Evenly spaced sample timestamps across the clip's source window.
 * Pure — covered by unit tests.
 */
export function stripTimestamps(
  durationSec: number,
  sourceInSec: number,
  count: number
): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('thumbnails: durationSec must be positive');
  }
  if (!Number.isFinite(sourceInSec) || sourceInSec < 0) {
    throw new Error('thumbnails: sourceInSec must be >= 0');
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('thumbnails: count must be a positive integer');
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round((sourceInSec + (durationSec * (i + 0.5)) / count) * 1000) / 1000);
  }
  return out;
}

/** URLs a plain <video> element can load without a native bridge. */
export function isDirectlyPlayableUrl(src: string): boolean {
  return /^(blob:|https?:|data:|asset:)/.test(src);
}

export function filmstripCacheKey(src: string, count: number, widthPx: number): string {
  return `${src}::${count}::${Math.round(widthPx)}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('thumbnails: timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function awaitVideoEvent(el: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  const wait = new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onBad);
    };
    const onOk = (): void => {
      cleanup();
      resolve();
    };
    const onBad = (): void => {
      cleanup();
      reject(new Error(`thumbnails: video ${event} failed`));
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onBad, { once: true });
  });
  return withTimeout(wait, timeoutMs);
}

function drawFrame(video: HTMLVideoElement, targetWidth: number): string | null {
  try {
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw <= 0 || vh <= 0) return null;
    const canvas = document.createElement('canvas');
    const height = Math.max(1, Math.round((targetWidth * vh) / vw));
    canvas.width = targetWidth;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetWidth, height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/** Captures one frame at `atSec` (clamped into the media). Never throws. */
export async function captureVideoFrame(
  src: string,
  atSec: number,
  targetWidth: number,
  opts?: CaptureOptions
): Promise<string | null> {
  try {
    if (typeof document === 'undefined') return null;
    if (!src) return null;
    const timeoutMs = opts?.timeoutMs ?? 3000;
    const factory = opts?.videoFactory ?? (() => document.createElement('video'));
    const video = factory();
    video.muted = true;
    video.preload = 'auto';
    try {
      (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
    } catch {
      // Ignore — cosmetic attribute only.
    }
    const ready = awaitVideoEvent(video, 'loadedmetadata', timeoutMs);
    video.src = src;
    await ready;
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : atSec + 1;
    const t = Math.min(Math.max(0, atSec), Math.max(0, dur - 0.05));
    video.currentTime = t;
    await awaitVideoEvent(video, 'seeked', timeoutMs);
    // A seek that silently lands elsewhere would duplicate one frame across
    // the whole strip — drop the frame instead (honest hole beats fake data).
    if (Math.abs(video.currentTime - t) > 0.3) return null;
    return drawFrame(video, targetWidth);
  } catch {
    return null;
  }
}

const stripCache = new Map<string, Promise<(string | null)[]>>();

/** Test hook: drops all cached captures. */
export function clearFilmstripCache(): void {
  stripCache.clear();
}

/**
 * Captures `count` frames across the source window. The returned array keeps
 * timestamp order; failed frames are `null`. Never throws; all-null results
 * are not cached so a later retry can succeed.
 */
export async function captureFilmstripFrames(
  src: string,
  req: FilmstripRequest & CaptureOptions
): Promise<(string | null)[]> {
  const width = Math.max(48, Math.min(192, Math.round(req.widthPx ?? 96)));
  const key = filmstripCacheKey(src, req.count, width);
  const hit = stripCache.get(key);
  if (hit) return hit;
  const job = (async (): Promise<(string | null)[]> => {
    const times = stripTimestamps(req.durationSec, req.sourceInSec, req.count);
    const out: (string | null)[] = [];
    for (const t of times) {
      out.push(
        await captureVideoFrame(src, t, width, {
          timeoutMs: req.timeoutMs,
          videoFactory: req.videoFactory,
        })
      );
    }
    return out;
  })();
  stripCache.set(key, job);
  void job.then(
    (frames) => {
      if (frames.every((f) => f === null)) stripCache.delete(key);
    },
    () => {
      // Invalid requests reject: never cache the failure.
      stripCache.delete(key);
    }
  );
  return job;
}

/** Single poster frame (~10% in, falls back to 1s). Never throws. */
export async function capturePosterFrame(src: string, opts?: CaptureOptions): Promise<string | null> {
  // Duration is unknown until metadata loads; captureVideoFrame clamps
  // into range by itself, so 10% cannot be precomputed — seek to 1s and
  // let the clamp handle shorter media.
  return captureVideoFrame(src, 1.0, Math.max(48, Math.min(192, Math.round(opts?.widthPx ?? 192))), opts);
}
