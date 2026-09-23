import { describe, it, expect, beforeEach } from 'vitest';
import { useMediaPoolStore } from '../mediaPool';

function seedAssets() {
  useMediaPoolStore.setState({
    assets: [
      {
        id: 'a1', name: 'Interview_Take1.mp4', path: '/m/i.mp4', type: 'video',
        duration: '00:00:10', fingerprint: 'fp1', isOffline: false,
      },
    ],
    customBins: [],
    activeBinId: 'bin-all',
    selectedAssetId: null,
  });
}

describe('R24.7 — asset metadata actions', () => {
  beforeEach(() => {
    seedAssets();
  });

  it('writes validated metadata and rejects garbage', () => {
    useMediaPoolStore.getState().updateAssetMetadata('a1', { scene: 'SC1', take: 2, rating: 5, tags: ['interview', ' selects '] });
    const asset = useMediaPoolStore.getState().assets[0];
    expect(asset.scene).toBe('SC1');
    expect(asset.take).toBe(2);
    expect(asset.rating).toBe(5);
    expect(asset.tags).toEqual(['interview', ' selects ']);

    expect(() => useMediaPoolStore.getState().updateAssetMetadata('a1', { rating: 9 })).toThrow();
    expect(() => useMediaPoolStore.getState().updateAssetMetadata('a1', { take: -1 })).toThrow();
    expect(() => useMediaPoolStore.getState().updateAssetMetadata('ghost', { scene: 'SC9' })).toThrow();
    // Failed writes left the asset untouched.
    expect(useMediaPoolStore.getState().assets[0].rating).toBe(5);
  });
});

describe('R24.7 — custom bin actions', () => {
  beforeEach(() => {
    seedAssets();
  });

  it('adds, selects and removes bins with validation', () => {
    const store = useMediaPoolStore.getState();
    store.addBin({ id: 'b-sc1', name: 'SC1', filters: [{ field: 'scene', op: 'eq', value: 'SC1' }] });
    expect(useMediaPoolStore.getState().customBins).toHaveLength(1);

    expect(() =>
      useMediaPoolStore.getState().addBin({ id: 'b-sc1', name: 'dup', filters: [] })
    ).toThrow();
    expect(() =>
      useMediaPoolStore.getState().addBin({ id: 'b-x', name: '', filters: [] })
    ).toThrow();

    useMediaPoolStore.getState().setActiveBin('b-sc1');
    expect(useMediaPoolStore.getState().activeBinId).toBe('b-sc1');
    useMediaPoolStore.getState().removeBin('b-sc1');
    expect(useMediaPoolStore.getState().customBins).toHaveLength(0);
    // Removing the active bin falls back to All Media.
    expect(useMediaPoolStore.getState().activeBinId).toBe('bin-all');
  });
});
