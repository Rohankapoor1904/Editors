import { describe, it, expect } from 'vitest';
import { PROXY_PRESETS, shouldAutoProxy, AUTO_PROXY_MIN_WIDTH } from '../../engine/proxyPresets';

describe('R26.4 — 4K auto-proxy predicate (used by AssetBin)', () => {
  it('decides proxy generation on 4K width threshold', () => {
    expect(AUTO_PROXY_MIN_WIDTH).toBe(3840);
    expect(shouldAutoProxy(3840)).toBe(true);
    expect(shouldAutoProxy(4096)).toBe(true);
    expect(shouldAutoProxy(1920)).toBe(false);
    expect(shouldAutoProxy(1080)).toBe(false);
    expect(shouldAutoProxy(undefined)).toBe(false);
    expect(shouldAutoProxy(Number.NaN)).toBe(false);
  });

  it('keeps preset catalogue aligned with the trigger defaults', () => {
    expect(PROXY_PRESETS[0].targetHeight).toBe(720);
    expect(PROXY_PRESETS.every((p) => p.targetHeight < AUTO_PROXY_MIN_WIDTH)).toBe(true);
  });
});
