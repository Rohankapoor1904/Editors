import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUFrameCache } from './frameCache';
import { FrameBuffer, nativeBridge } from '../services/nativeBridge';
import { createRational, rationalToSeconds } from '../types/time';

vi.mock('../services/nativeBridge', () => {
  return {
    nativeBridge: {
      demuxVideoFrames: vi.fn(),
    },
    FrameBuffer: vi.fn().mockImplementation((info: any, data: Uint8Array) => ({
      ...info,
      data,
      release: vi.fn(),
    })),
  };
});

describe('LRUFrameCache', () => {
  let cache: LRUFrameCache;

  beforeEach(() => {
    cache = new LRUFrameCache({ maxFrames: 10, prefetchCount: 2, backwardBufferSec: 0.1 });
    vi.clearAllMocks();
  });

  it('should return null for cache miss', () => {
    const time = createRational(0, 1);
    expect(cache.getFrame('test.mp4', time)).toBeNull();
    expect(cache.getCacheHitRatio()).toBe(0);
  });

  it('should simplify keys correctly so identical times hit the cache', () => {
    const mockRelease = vi.fn();
    const frame = { release: mockRelease } as unknown as FrameBuffer;

    cache.addFrame('test.mp4', createRational(1, 2), frame);

    // Request with unsimplified time 2/4 which equals 1/2
    const retrieved = cache.getFrame('test.mp4', createRational(2, 4));
    expect(retrieved).toBe(frame);
  });

  it('should map inexact requested times to closest exact PTS using aliases', async () => {
    vi.mocked(nativeBridge.demuxVideoFrames).mockImplementation(async (_path, _fetchStart, count) => {
      // simulate backend returning frames at exact 0.1s intervals (10fps)
      // fetchStart will be ~0.45s because requested was 0.55s and buffer is 0.1s
      // We will just return frames starting at 0.4
      const startPts = 0.4;
      const frames = [];
      for (let i = 0; i < (count || 1); i++) {
        frames.push(new FrameBuffer({
          frame_index: i,
          timestamp_pts: startPts + i * 0.1, // 0.4, 0.5, 0.6
          width: 1920,
          height: 1080,
          format: 'YUV420P',
          data_buffer_len: 1024,
        }, new Uint8Array(1024)));
      }
      return frames;
    });

    // Request arbitrary audio-driven float time: 0.52s
    const targetTime = createRational(52, 100);

    const frame = await cache.getOrFetchFrame('test.mp4', targetTime);
    expect(frame.timestamp_pts).toBe(0.5); // closest is 0.5

    // Now ask for the exact same arbitrary time again. It should be a cache HIT via alias.
    const hitFrame = cache.getFrame('test.mp4', targetTime);
    expect(hitFrame).toBe(frame);
    expect(cache.getCacheHitRatio()).toBe(0.5); // 1 miss, 1 hit
  });

  it('should fetch a backward window to support backward scrubbing', async () => {
    vi.mocked(nativeBridge.demuxVideoFrames).mockImplementation(async (_path, time, count) => {
      const timeSec = rationalToSeconds(time);
      const frames = [];
      for (let i = 0; i < (count || 1); i++) {
        frames.push(new FrameBuffer({
          frame_index: i,
          timestamp_pts: timeSec + i * 0.1,
          width: 1920,
          height: 1080,
          format: 'YUV420P',
          data_buffer_len: 1024,
        }, new Uint8Array(1024)));
      }
      return frames;
    });

    const targetTime = createRational(5, 10); // 0.5s

    // requested time is 0.5s. backward buffer is 0.1s. fetch start time = 0.4s.
    // fetch count = 3 frames.
    // returned pts: 0.4, 0.5, 0.6
    cache = new LRUFrameCache({ maxFrames: 10, prefetchCount: 3, backwardBufferSec: 0.1 });
    await cache.getOrFetchFrame('test.mp4', targetTime);

    // Now check if backward frame (0.4s) is cached directly by exact PTS
    const backwardTime = createRational(4, 10);
    expect(cache.getFrame('test.mp4', backwardTime)).not.toBeNull();

    // Check if target frame (0.5s) is cached
    expect(cache.getFrame('test.mp4', targetTime)).not.toBeNull();

    // Check if forward frame (0.6s) is cached
    const forwardTime = createRational(6, 10);
    expect(cache.getFrame('test.mp4', forwardTime)).not.toBeNull();
  });
});
