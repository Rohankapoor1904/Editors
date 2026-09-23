import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAssetBytes, decodeToMono } from './audioAnalyze';

describe('R24.3 remainder — asset byte fetching', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches blob URLs and surfaces HTTP failures honestly', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(bytes) }));
    await expect(fetchAssetBytes('blob:mock-audio')).resolves.toBe(bytes);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchAssetBytes('https://example.com/missing.wav')).rejects.toThrow(/HTTP 404/);

    await expect(fetchAssetBytes('')).rejects.toThrow(/non-empty/);
  });

  it('refuses native paths outside the Tauri host instead of guessing', async () => {
    await expect(fetchAssetBytes('C:\\media\\take.wav')).rejects.toThrow(/Tauri host/);
    await expect(fetchAssetBytes('/media/take.wav')).rejects.toThrow(/Tauri host/);
  });
});

describe('R24.3 remainder — decoder honesty', () => {
  it('throws a typed error where no WebAudio decoder exists (this rig)', async () => {
    expect(typeof window).toBe('object');
    await expect(decodeToMono(new Uint8Array([0, 1, 2]).buffer)).rejects.toThrow(/no WebAudio decoder/);
    await expect(decodeToMono(new ArrayBuffer(0))).rejects.toThrow(/non-empty/);
  });
});
