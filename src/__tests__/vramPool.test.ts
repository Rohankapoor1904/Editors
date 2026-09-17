import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VRAMTexturePool, TextureDescriptor } from '../engine/vramPool';

describe('VRAMTexturePool', () => {
  let pool: VRAMTexturePool;
  let mockDevice: GPUDevice;

  beforeEach(() => {
    pool = new VRAMTexturePool({ maxVRAMBytes: 256 * 1024 * 1024 }); // 256MB

    // Mock GPUDevice and GPUTexture
    mockDevice = {
      createTexture: vi.fn((descriptor: GPUTextureDescriptor) => ({
        descriptor,
        destroy: vi.fn(),
        // Add a dummy id to distinguish textures
        id: Math.random(),
      } as unknown as GPUTexture)),
    } as unknown as GPUDevice;
  });

  it('allocates a new texture when pool is empty', () => {
    const desc: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm', usage: 0 };
    const texture = pool.acquire(mockDevice, desc);

    expect(mockDevice.createTexture).toHaveBeenCalledTimes(1);
    expect(pool.getPoolSize()).toBe(1);
    expect(texture).toBeDefined();
  });

  it('aliases (reuses) an existing texture if specs match and it is not in use', () => {
    const desc: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm', usage: 0 };

    const texture1 = pool.acquire(mockDevice, desc);
    pool.release(texture1);

    const texture2 = pool.acquire(mockDevice, desc);

    expect(mockDevice.createTexture).toHaveBeenCalledTimes(1); // Should only create once
    expect(pool.getPoolSize()).toBe(1);
    expect(texture1).toBe(texture2); // Should be the exact same object
  });

  it('allocates a new texture if specs match but existing texture is in use', () => {
    const desc: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm', usage: 0 };

    const texture1 = pool.acquire(mockDevice, desc);
    const texture2 = pool.acquire(mockDevice, desc);

    expect(mockDevice.createTexture).toHaveBeenCalledTimes(2);
    expect(pool.getPoolSize()).toBe(2);
    expect(texture1).not.toBe(texture2);
  });

  it('allocates a new texture if specs do not match', () => {
    const desc1: TextureDescriptor = { width: 1920, height: 1080, format: 'rgba8unorm', usage: 0 };
    const desc2: TextureDescriptor = { width: 1280, height: 720, format: 'rgba8unorm', usage: 0 };

    const texture1 = pool.acquire(mockDevice, desc1);
    pool.release(texture1);

    const texture2 = pool.acquire(mockDevice, desc2);

    expect(mockDevice.createTexture).toHaveBeenCalledTimes(2);
    expect(pool.getPoolSize()).toBe(2); // One free 1080p, one in-use 720p
    expect(texture2).toBeDefined();
  });

  it('stress test: 6x 4K layers within budget', () => {
    // 4K RGBA8 is 3840 * 2160 * 4 = 33,177,600 bytes (~31.6 MB)
    // 6 * 33.17MB = 199.06 MB < 256 MB budget

    const desc: TextureDescriptor = { width: 3840, height: 2160, format: 'rgba8unorm', usage: 0 };

    const textures = [];
    for (let i = 0; i < 6; i++) {
      textures.push(pool.acquire(mockDevice, desc));
    }

    expect(mockDevice.createTexture).toHaveBeenCalledTimes(6);
    expect(pool.getPoolSize()).toBe(6);

    const expectedBytes = 6 * 3840 * 2160 * 4;
    expect(pool.getUsage()).toBe(expectedBytes);
  });

  it('evicts unused textures when budget is exceeded', () => {
    // Budget: 100 MB
    pool = new VRAMTexturePool({ maxVRAMBytes: 100 * 1024 * 1024 });
    const desc: TextureDescriptor = { width: 3840, height: 2160, format: 'rgba8unorm', usage: 0 }; // ~31.6 MB

    // Allocate 3 (3 * ~31.6 = ~95MB) -> Fits
    const t1 = pool.acquire(mockDevice, desc);
    pool.acquire(mockDevice, desc);
    pool.acquire(mockDevice, desc);

    expect(pool.getPoolSize()).toBe(3);

    // Release t1
    pool.release(t1);

    // Allocate a 4th texture that is a DIFFERENT format so it cannot alias t1, forcing an eviction of t1
    // 4K rgba16float is 3840 * 2160 * 8 = ~66 MB.
    // Current usage is ~95MB. New need is ~66 MB. Target is 100MB.
    // It will evict t1 (31.6MB), usage drops to ~63MB, then allocates 66MB -> Total ~129MB > 100MB which throws.
    // Wait, let's just make the new texture small enough so it fits after eviction.
    // We need 95 - 31.6 + X <= 100 => 63.4 + X <= 100 => X <= 36.6 MB.
    // Let's allocate a new 4K RGBA8 but with DIFFERENT usage to prevent aliasing.
    const desc2: TextureDescriptor = { width: 3840, height: 2160, format: 'rgba8unorm', usage: 1 };

    const t4 = pool.acquire(mockDevice, desc2);

    expect(pool.getPoolSize()).toBe(3); // t1 was evicted, replaced by t4
    expect((t1 as any).destroy).toHaveBeenCalledTimes(1); // t1 should be destroyed
    expect(t4).toBeDefined();
  });

  it('throws Error if budget is exceeded and nothing can be evicted', () => {
    // Budget: 100 MB
    pool = new VRAMTexturePool({ maxVRAMBytes: 100 * 1024 * 1024 });
    const desc: TextureDescriptor = { width: 3840, height: 2160, format: 'rgba8unorm', usage: 0 }; // ~31.6 MB

    // Allocate 3 (3 * ~31.6 = ~95MB) -> Fits
    pool.acquire(mockDevice, desc);
    pool.acquire(mockDevice, desc);
    pool.acquire(mockDevice, desc);

    // Allocate a 4th with different usage so it doesn't alias, but NONE are released.
    const desc2: TextureDescriptor = { width: 3840, height: 2160, format: 'rgba8unorm', usage: 1 };
    expect(() => {
      pool.acquire(mockDevice, desc2);
    }).toThrow(/VRAM exhaustion/);
  });
});
