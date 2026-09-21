import { create } from 'zustand';

export interface MediaAsset {
  id: string;
  name: string;
  path: string;
  thumbnailUrl?: string;
  proxyPath?: string;
  proxyStatus?: 'none' | 'generating' | 'ready' | 'failed';
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
  selectedAssetId: string | null;
  proxyModeEnabled: boolean;
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (assetId: string) => void;
  updateAssetStatus: (assetId: string, isOffline: boolean) => void;
  relinkAsset: (assetId: string, newPath: string) => void;
  selectAsset: (assetId: string | null) => void;
  toggleProxyMode: () => void;
  setAssetProxy: (assetId: string, proxyPath: string, status?: MediaAsset['proxyStatus']) => void;
  setAssetProxyStatus: (assetId: string, status: MediaAsset['proxyStatus']) => void;
}

export const useMediaPoolStore = create<MediaPoolState>((set) => ({
  assets: [],
  selectedAssetId: null,
  proxyModeEnabled: false,
  selectAsset: (assetId) => set({ selectedAssetId: assetId }),
  toggleProxyMode: () => set((state) => ({ proxyModeEnabled: !state.proxyModeEnabled })),
  setAssetProxy: (assetId, proxyPath, status = 'ready') =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === assetId ? { ...a, proxyPath, proxyStatus: status } : a
      ),
    })),
  setAssetProxyStatus: (assetId, status) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === assetId ? { ...a, proxyStatus: status } : a
      ),
    })),
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
