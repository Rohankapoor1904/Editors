import { describe, it, expect, beforeEach } from 'vitest';
import {
  stripTimestamps,
  isDirectlyPlayableUrl,
  filmstripCacheKey,
  capturePosterFrame,
  captureFilmstripFrames,
  clearFilmstripCache,
} from './thumbnails';

describe('thumbnails — pure helpers', () => {
  it('spaces sample timestamps evenly across the source window', () => {
    expect(stripTimestamps(10, 2, 4)).toEqual([3.25, 5.75, 8.25, 10.75]);
    expect(stripTimestamps(46, 0, 1)).toEqual([23]);
  });

  it('rejects invalid windows instead of inventing timestamps', () => {
    expect(() => stripTimestamps(0, 0, 4)).toThrow(/durationSec/);
    expect(() => stripTimestamps(10, -1, 4)).toThrow(/sourceInSec/);
    expect(() => stripTimestamps(10, 0, 0)).toThrow(/count/);
    expect(() => stripTimestamps(NaN, 0, 4)).toThrow();
  });

  it('classifies directly playable URLs', () => {
    expect(isDirectlyPlayableUrl('blob:abc')).toBe(true);
    expect(isDirectlyPlayableUrl('https://cdn/x.mp4')).toBe(true);
    expect(isDirectlyPlayableUrl('http://localhost:3000/a.mp4')).toBe(true);
    expect(isDirectlyPlayableUrl('data:video/mp4;base64,AAA')).toBe(true);
    expect(isDirectlyPlayableUrl('C:\\Media\\clip.mp4')).toBe(false);
    expect(isDirectlyPlayableUrl('/m/clip.mp4')).toBe(false);
    expect(isDirectlyPlayableUrl('')).toBe(false);
  });

  it('builds stable cache keys', () => {
    expect(filmstripCacheKey('s', 4, 96.4)).toBe(filmstripCacheKey('s', 4, 96.2));
    expect(filmstripCacheKey('s', 4, 96)).not.toBe(filmstripCacheKey('s', 5, 96));
    expect(filmstripCacheKey('a', 4, 96)).not.toBe(filmstripCacheKey('b', 4, 96));
  });
});

describe('thumbnails — honest failure paths', () => {
  beforeEach(() => {
    clearFilmstripCache();
  });

  it('poster capture resolves null when the element factory throws', async () => {
    const factory = (): HTMLVideoElement => {
      throw new Error('no media backend');
    };
    await expect(capturePosterFrame('blob:x', { timeoutMs: 50, videoFactory: factory })).resolves.toBeNull();
  });

  it('filmstrip resolves nulls (never throws) when media never loads', async () => {
    let factoryCalls = 0;
    const factory = (): HTMLVideoElement => {
      factoryCalls += 1;
      // Never fires loadedmetadata — the timeout path must win quickly.
      const listeners: Record<string, Array<() => void>> = {};
      return {
        muted: false,
        preload: '',
        src: '',
        currentTime: 0,
        duration: NaN,
        videoWidth: 0,
        videoHeight: 0,
        addEventListener: (event: string, cb: () => void) => {
          (listeners[event] ??= []).push(cb);
        },
        removeEventListener: () => undefined,
      } as unknown as HTMLVideoElement;
    };
    const frames = await captureFilmstripFrames('blob:x', {
      durationSec: 10,
      sourceInSec: 0,
      count: 2,
      timeoutMs: 30,
      videoFactory: factory,
    });
    expect(frames).toEqual([null, null]);
    expect(factoryCalls).toBe(2);
  });

  it('concurrent identical requests share one decode job', async () => {
    let factoryCalls = 0;
    const factory = (): HTMLVideoElement => {
      factoryCalls += 1;
      return {
        muted: false,
        preload: '',
        src: '',
        currentTime: 0,
        duration: NaN,
        videoWidth: 0,
        videoHeight: 0,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      } as unknown as HTMLVideoElement;
    };
    const req = { durationSec: 10, sourceInSec: 0, count: 1, timeoutMs: 30, videoFactory: factory };
    const [a, b] = await Promise.all([captureFilmstripFrames('blob:shared', req), captureFilmstripFrames('blob:shared', req)]);
    expect(a).toEqual([null]);
    expect(b).toEqual([null]);
    expect(factoryCalls).toBe(1);
  });

  it('invalid requests reject instead of caching garbage', async () => {
    await expect(
      captureFilmstripFrames('blob:x', { durationSec: 0, sourceInSec: 0, count: 2, timeoutMs: 30 })
    ).rejects.toThrow(/durationSec/);
  });

  it('walks the event path and still resolves honest nulls without pixels', async () => {
    const listeners: Record<string, Array<() => void>> = {};
    const fire = (event: string): void => {
      window.setTimeout(() => (listeners[event] ?? []).forEach((cb) => cb()), 0);
    };
    const factory = (): HTMLVideoElement =>
      ({
        muted: false,
        preload: '',
        src: '',
        currentTime: 0,
        duration: 20,
        videoWidth: 0,
        videoHeight: 0,
        addEventListener: (event: string, cb: () => void) => {
          (listeners[event] ??= []).push(cb);
          if (event === 'loadedmetadata' || event === 'seeked') fire(event);
        },
        removeEventListener: () => undefined,
      }) as unknown as HTMLVideoElement;
    const frames = await captureFilmstripFrames('blob:eventful', {
      durationSec: 10,
      sourceInSec: 0,
      count: 2,
      timeoutMs: 1000,
      videoFactory: factory,
    });
    // Metadata + seeks succeed, but zero-size frames carry no pixels.
    expect(frames).toEqual([null, null]);
  });
});
