export interface TextureDescriptor {
  width: number;
  height: number;
  format: GPUTextureFormat;
  usage: number;
}

export interface VRAMPoolConfig {
  maxVRAMBytes: number;
}

interface PoolEntry {
  texture: GPUTexture;
  descriptor: TextureDescriptor;
  sizeBytes: number;
  lastUsedTime: number;
  inUse: boolean;
}

export class VRAMTexturePool {
  private pool: PoolEntry[] = [];
  private currentVRAMBytes: number = 0;
  private maxVRAMBytes: number;

  constructor(config: VRAMPoolConfig = { maxVRAMBytes: 256 * 1024 * 1024 }) { // Default 256MB
    this.maxVRAMBytes = config.maxVRAMBytes;
  }

  private getBytesPerPixel(format: GPUTextureFormat): number {
    // A simplified mapping, but sufficient for standard WebGPU formats used here
    switch (format) {
      case 'rgba8unorm':
      case 'bgra8unorm':
      case 'rgba8snorm':
      case 'rgba8uint':
      case 'rgba8sint':
        return 4;
      case 'rgba16float':
        return 8;
      case 'rgba32float':
        return 16;
      case 'r8unorm':
      case 'r8snorm':
      case 'r8uint':
      case 'r8sint':
        return 1;
      case 'rg8unorm':
      case 'rg8snorm':
      case 'rg8uint':
      case 'rg8sint':
        return 2;
      default:
        // Defaulting to 4 for unknown common ones
        return 4;
    }
  }

  private calculateSizeBytes(desc: TextureDescriptor): number {
    return desc.width * desc.height * this.getBytesPerPixel(desc.format);
  }

  private descriptorsMatch(a: TextureDescriptor, b: TextureDescriptor): boolean {
    return (
      a.width === b.width &&
      a.height === b.height &&
      a.format === b.format &&
      a.usage === b.usage
    );
  }

  public acquire(device: GPUDevice, descriptor: TextureDescriptor): GPUTexture {
    // 1. Try to find a free texture that matches exactly (Aliasing)
    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (!entry.inUse && this.descriptorsMatch(entry.descriptor, descriptor)) {
        entry.inUse = true;
        entry.lastUsedTime = performance.now();
        return entry.texture;
      }
    }

    // 2. Allocate new texture
    const sizeBytes = this.calculateSizeBytes(descriptor);

    // Enforce budget: Evict if needed
    if (this.currentVRAMBytes + sizeBytes > this.maxVRAMBytes) {
      this.evictToFit(sizeBytes);

      // Check again after eviction
      if (this.currentVRAMBytes + sizeBytes > this.maxVRAMBytes) {
        throw new Error(`VRAM exhaustion: Cannot allocate texture of size ${sizeBytes} bytes. Current usage: ${this.currentVRAMBytes}/${this.maxVRAMBytes}`);
      }
    }

    const texture = device.createTexture({
      size: [descriptor.width, descriptor.height, 1],
      format: descriptor.format,
      usage: descriptor.usage,
    });

    this.pool.push({
      texture,
      descriptor,
      sizeBytes,
      lastUsedTime: performance.now(),
      inUse: true,
    });

    this.currentVRAMBytes += sizeBytes;

    return texture;
  }

  public release(texture: GPUTexture): void {
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].texture === texture) {
        this.pool[i].inUse = false;
        return;
      }
    }
  }

  private evictToFit(requiredBytes: number): void {
    // Sort pool by LRU
    this.pool.sort((a, b) => a.lastUsedTime - b.lastUsedTime);

    let bytesFreed = 0;
    const newPool: PoolEntry[] = [];

    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];

      if (!entry.inUse && this.currentVRAMBytes - bytesFreed + requiredBytes > this.maxVRAMBytes) {
        // Evict
        try {
          entry.texture.destroy();
        } catch (e) { /* ignore */ }
        bytesFreed += entry.sizeBytes;
      } else {
        newPool.push(entry);
      }
    }

    this.pool = newPool;
    this.currentVRAMBytes -= bytesFreed;
  }

  public clear(): void {
    for (const entry of this.pool) {
      try {
        entry.texture.destroy();
      } catch (e) { /* ignore */ }
    }
    this.pool = [];
    this.currentVRAMBytes = 0;
  }

  public getUsage(): number {
    return this.currentVRAMBytes;
  }

  public getPoolSize(): number {
    return this.pool.length;
  }
}

export const vramPool = new VRAMTexturePool();
