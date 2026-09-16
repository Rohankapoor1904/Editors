import { RationalTime, rationalToSeconds, createRational, subRational } from '../types/time';
import { FrameBuffer, nativeBridge } from '../services/nativeBridge';

export interface FrameCacheConfig {
  maxFrames: number;
  prefetchCount: number;
  backwardBufferSec: number;
}

export class LRUFrameCache {
  private cache: Map<string, FrameBuffer>;
  private aliases: Map<string, string>; // Maps requested time string to actual PTS string
  private maxFrames: number;
  private prefetching: Map<string, Promise<FrameBuffer>>;
  private prefetchCount: number;
  private backwardBufferSec: number;

  private hits: number = 0;
  private misses: number = 0;

  constructor(config: FrameCacheConfig = { maxFrames: 300, prefetchCount: 30, backwardBufferSec: 0.5 }) {
    this.cache = new Map();
    this.aliases = new Map();
    // Ensure maxFrames is always strictly greater than prefetchCount to prevent UAF during fetch
    this.maxFrames = Math.max(config.maxFrames, config.prefetchCount + 5);
    this.prefetching = new Map();
    this.prefetchCount = config.prefetchCount;
    this.backwardBufferSec = config.backwardBufferSec;
  }

  // Simplify a RationalTime locally to ensure equivalent times generate the same key
  private simplifyTime(time: RationalTime): RationalTime {
    const gcd = (a: number, b: number): number => {
      a = Math.abs(a);
      b = Math.abs(b);
      while (b) {
        const temp = b;
        b = a % b;
        a = temp;
      }
      return a;
    };
    const divisor = gcd(time.value, time.rate);
    if (divisor === 0) return time;
    return { value: time.value / divisor, rate: time.rate / divisor };
  }

  private generateKey(mediaPath: string, time: RationalTime): string {
    const simple = this.simplifyTime(time);
    return `${mediaPath}_${simple.value}_${simple.rate}`;
  }

  public getFrame(mediaPath: string, time: RationalTime): FrameBuffer | null {
    const requestedKey = this.generateKey(mediaPath, time);

    // Resolve alias if one exists
    const actualKey = this.aliases.get(requestedKey) || requestedKey;

    if (this.cache.has(actualKey)) {
      this.hits++;
      const frame = this.cache.get(actualKey)!;
      // O(1) LRU update
      this.cache.delete(actualKey);
      this.cache.set(actualKey, frame);
      return frame;
    }

    this.misses++;
    return null;
  }

  public async getOrFetchFrame(mediaPath: string, time: RationalTime): Promise<FrameBuffer> {
    const existing = this.getFrame(mediaPath, time);
    if (existing) {
        return existing;
    }
    return this.prefetchFrame(mediaPath, time);
  }

  public async prefetchFrame(mediaPath: string, time: RationalTime): Promise<FrameBuffer> {
    const requestedKey = this.generateKey(mediaPath, time);

    if (this.prefetching.has(requestedKey)) {
      return this.prefetching.get(requestedKey)!;
    }

    const fetchPromise = this.executeFetch(mediaPath, time, requestedKey);
    this.prefetching.set(requestedKey, fetchPromise);

    try {
        const frame = await fetchPromise;
        return frame;
    } finally {
        this.prefetching.delete(requestedKey);
    }
  }

  private async executeFetch(mediaPath: string, time: RationalTime, requestedKey: string): Promise<FrameBuffer> {
    const backwardBuffer = createRational(Math.round(this.backwardBufferSec * time.rate), time.rate);
    let fetchStartTime = subRational(time, backwardBuffer);

    if (fetchStartTime.value < 0) {
        fetchStartTime = createRational(0, time.rate);
    }

    const frames = await nativeBridge.demuxVideoFrames(mediaPath, fetchStartTime, this.prefetchCount);

    if (frames.length === 0) {
        throw new Error("No frames extracted");
    }

    let targetFrame = frames[0];
    let targetFrameKey = '';
    let minDiff = Number.MAX_VALUE;
    const targetTimeSec = rationalToSeconds(time);

    // Identify the best target frame first
    for (const f of frames) {
        const diff = Math.abs(f.timestamp_pts - targetTimeSec);
        if (diff < minDiff) {
            minDiff = diff;
            targetFrame = f;
            const frameRationalValue = Math.round(f.timestamp_pts * time.rate);
            const frameRational = createRational(frameRationalValue, time.rate);
            targetFrameKey = this.generateKey(mediaPath, frameRational);
        }
    }

    // Cache frames, skipping the target frame so we can insert it LAST
    for (const f of frames) {
        if (f === targetFrame) continue;

        const frameRationalValue = Math.round(f.timestamp_pts * time.rate);
        const frameRational = createRational(frameRationalValue, time.rate);
        const frameKey = this.generateKey(mediaPath, frameRational);

        if (!this.cache.has(frameKey)) {
            this.enforceCapacity();
            this.cache.set(frameKey, f);
        } else {
            try { f.release(); } catch (e) { /* ignore */ }
        }
    }

    // Insert the target frame LAST to guarantee it is the most recently used and not evicted
    if (!this.cache.has(targetFrameKey)) {
        this.enforceCapacity();
        this.cache.set(targetFrameKey, targetFrame);
    } else {
        // Even if it exists, it must be the same data representing the same PTS, so we release the new one
        try { targetFrame.release(); } catch (e) { /* ignore */ }
        targetFrame = this.cache.get(targetFrameKey)!;

        // update LRU
        this.cache.delete(targetFrameKey);
        this.cache.set(targetFrameKey, targetFrame);
    }

    // Map the arbitrarily requested time key to the exact PTS frame key
    if (requestedKey !== targetFrameKey) {
        this.aliases.set(requestedKey, targetFrameKey);
    }

    return targetFrame;
  }

  private enforceCapacity() {
    if (this.cache.size >= this.maxFrames) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
            const oldFrame = this.cache.get(oldestKey);
            if (oldFrame) {
                try { oldFrame.release(); } catch (e) { /* ignore */ }
            }
            this.cache.delete(oldestKey);
        }
    }
  }

  public addFrame(mediaPath: string, time: RationalTime, frame: FrameBuffer) {
    const key = this.generateKey(mediaPath, time);

    if (this.cache.has(key)) {
        const oldFrame = this.cache.get(key);
        if (oldFrame) {
             try { oldFrame.release(); } catch (e) { /* ignore */ }
        }
        this.cache.delete(key);
    } else {
        this.enforceCapacity();
    }

    this.cache.set(key, frame);
  }

  public clear() {
      for (const frame of this.cache.values()) {
          try { frame.release(); } catch (e) { /* ignore */ }
      }
      this.cache.clear();
      this.aliases.clear();
      this.prefetching.clear();
      this.hits = 0;
      this.misses = 0;
  }

  public getCacheHitRatio(): number {
      const total = this.hits + this.misses;
      if (total === 0) return 0;
      return this.hits / total;
  }
}

export const frameCache = new LRUFrameCache();
