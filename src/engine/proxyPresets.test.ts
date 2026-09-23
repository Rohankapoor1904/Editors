import { describe, it, expect } from 'vitest';
import { PROXY_PRESETS, getProxyPreset, validateProxyPreset, defaultProxyPath, proxyExtension } from './proxyPresets';

describe('R26.4 — proxy presets catalogue', () => {
  it('ships four validated presets with correct codecs', () => {
    expect(PROXY_PRESETS).toHaveLength(4);
    for (const p of PROXY_PRESETS) {
      expect(() => validateProxyPreset(p)).not.toThrow();
    }
    expect(getProxyPreset('proxy-720p-h264').codec).toBe('h264');
    expect(getProxyPreset('proxy-720p-prores').codec).toBe('prores');
    expect(() => getProxyPreset('unknown')).toThrow();
    expect(() => validateProxyPreset({ ...PROXY_PRESETS[0], codec: 'hevc' as never })).toThrow();
  });

  it('maps extensions and default paths correctly', () => {
    expect(proxyExtension('h264')).toBe('mp4');
    expect(proxyExtension('prores')).toBe('mov');
    expect(defaultProxyPath('/media/foo/bar.mp4', 'h264')).toBe('/media/foo/bar.proxy.mp4');
    expect(defaultProxyPath('/media/foo/bar.mp4', 'prores')).toBe('/media/foo/bar.proxy.mov');
    expect(defaultProxyPath('C:\\media\\clip.mov', 'h264')).toBe('C:/media/clip.proxy.mp4');
    expect(() => defaultProxyPath('', 'h264')).toThrow();
  });
});
