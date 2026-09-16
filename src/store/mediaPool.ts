import { create } from 'zustand';

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  type: 'video' | 'audio' | 'subtitle' | 'ai';
  duration: string;
  badge?: string;
  fps?: string;
  resolution?: string;
  fingerprint: string;
  isOffline: boolean;
}

interface MediaPoolState {
  assets: MediaAsset[];
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (assetId: string) => void;
  updateAssetStatus: (assetId: string, isOffline: boolean) => void;
  relinkAsset: (assetId: string, newPath: string) => void;
}

export const useMediaPoolStore = create<MediaPoolState>((set) => ({
  assets: [],
  addAsset: (asset) =>
    set((state) => {
      const existsIndex = state.assets.findIndex((a) => a.fingerprint === asset.fingerprint);
      if (existsIndex >= 0) {
        // Update existing asset (preserves ID for timeline clips)
        const updatedAssets = [...state.assets];
        updatedAssets[existsIndex] = {
          ...updatedAssets[existsIndex],
          path: asset.path,
          isOffline: false,
        };
        return { assets: updatedAssets };
      }
      return { assets: [asset, ...state.assets] };
    }),
  removeAsset: (assetId) =>
    set((state) => ({
      assets: state.assets.filter((a) => a.id !== assetId),
    })),
  updateAssetStatus: (assetId, isOffline) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === assetId ? { ...a, isOffline } : a
      ),
    })),
  relinkAsset: (assetId, newPath) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === assetId ? { ...a, path: newPath, isOffline: false } : a
      ),
    })),
}));
