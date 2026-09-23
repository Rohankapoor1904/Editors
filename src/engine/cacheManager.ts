/**
 * R26.4 — render/proxy cache manager (byte-budget LRU).
 *
 * This is a generic in-memory cache for decoded frames, proxy segments, or
 * any byte-addressable payload. It tracks total bytes, evicts LRU on budget
 * overflow, and never exceeds the budget after a successful put (unless a
 * single entry is larger than the budget — then it is rejected loudly).
 * Pure and deterministic, fully unit-tested.
 */

export interface CacheEntry<T> {
  key: string;
  bytes: number;
  value: T;
}

export class CacheManager<T> {
  private readonly maxBytes: number;
  private currentBytes = 0;
  private readonly map = new Map<string, { bytes: number; value: T }>();

  constructor(maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new Error('cacheManager: maxBytes must be a positive finite number');
    }
    this.maxBytes = maxBytes;
  }

  get sizeBytes(): number {
    return this.currentBytes;
  }

  get capacityBytes(): number {
    return this.maxBytes;
  }

  get count(): number {
    return this.map.size;
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Move to MRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  /**
   * Inserts or replaces an entry. Evicts LRU until the budget fits.
   * Throws if the entry alone exceeds the budget (caller must widen or shrink).
   */
  put(key: string, value: T, bytes: number): void {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('cacheManager: key must be a non-empty string');
    }
    if (!Number.isFinite(bytes) || bytes <= 0) {
      throw new Error('cacheManager: bytes must be a positive finite number');
    }
    if (bytes > this.maxBytes) {
      throw new Error(`cacheManager: entry ${bytes} bytes exceeds budget ${this.maxBytes}`);
    }
    const existing = this.map.get(key);
    if (existing) {
      this.currentBytes -= existing.bytes;
      this.map.delete(key);
    }
    // Evict LRU until space
    while (this.currentBytes + bytes > this.maxBytes && this.map.size > 0) {
      const lruKey = this.map.keys().next().value as string;
      const lru = this.map.get(lruKey)!;
      this.currentBytes -= lru.bytes;
      this.map.delete(lruKey);
    }
    this.map.set(key, { bytes, value });
    this.currentBytes += bytes;
  }

  delete(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.currentBytes -= entry.bytes;
    this.map.delete(key);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.currentBytes = 0;
  }

  /** Keys in LRU → MRU order (for testing eviction). */
  keys(): string[] {
    return [...this.map.keys()];
  }
}
