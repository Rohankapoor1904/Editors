import { create } from 'zustand';
import { BinDefinition, validateBinDefinition } from './mediaBins';

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
  /** R24.7: editorial metadata (scene/take/rating/tags). */
  scene?: string;
  take?: number;
  rating?: number;
  tags?: string[];
}

export interface AssetMetadataPatch {
  scene?: string;
  take?: number;
  rating?: number;
  tags?: string[];
}

/** R24.7 — validates a metadata patch; throws instead of storing garbage. */
export function validateAssetMetadata(patch: AssetMetadataPatch): void {
  if (patch.rating !== undefined && (!Number.isInteger(patch.rating) || patch.rating < 0 || patch.rating > 5)) {
    throw new Error('mediaPool: rating must be an integer 0..5');
  }
  if (patch.take !== undefined && (!Number.isInteger(patch.take) || patch.take < 0)) {
    throw new Error('mediaPool: take must be a non-negative integer');
  }
  if (patch.scene !== undefined && typeof patch.scene !== 'string') {
    throw new Error('mediaPool: scene must be a string');
  }
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || patch.tags.some((t) => typeof t !== 'string')) {
      throw new Error('mediaPool: tags must be an array of strings');
    }
  }
}

interface MediaPoolState {
  assets: MediaAsset[];
  selectedAssetId: string | null;
  proxyModeEnabled: boolean;
  /** R24.7: custom bins + active bin selection (built-ins always available). */
  customBins: BinDefinition[];
  activeBinId: string;
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (assetId: string) => void;
  updateAssetStatus: (assetId: string, isOffline: boolean) => void;
  updateAssetMetadata: (assetId: string, patch: AssetMetadataPatch) => void;
  relinkAsset: (assetId: string, newPath: string) => void;
  selectAsset: (assetId: string | null) => void;
  toggleProxyMode: () => void;
  setAssetProxy: (assetId: string, proxyPath: string, status?: MediaAsset['proxyStatus']) => void;
  setAssetProxyStatus: (assetId: string, status: MediaAsset['proxyStatus']) => void;
  addBin: (def: BinDefinition) => void;
  removeBin: (binId: string) => void;
  setActiveBin: (binId: string) => void;
}

export const useMediaPoolStore = create<MediaPoolState>((set) => ({
  assets: [],
  selectedAssetId: null,
  proxyModeEnabled: false,
  customBins: [],
  activeBinId: 'bin-all',
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
  updateAssetMetadata: (assetId, patch) => {
    validateAssetMetadata(patch);
    set((state) => {
      if (!state.assets.some((a) => a.id === assetId)) {
        throw new Error(`mediaPool: asset '${assetId}' not found`);
      }
      return {
        assets: state.assets.map((a) =>
          a.id === assetId ? { ...a, ...patch, tags: patch.tags ? [...patch.tags] : a.tags } : a
        ),
      };
    });
  },
  addBin: (def) => {
    validateBinDefinition(def);
    set((state) => {
      if (state.customBins.some((b) => b.id === def.id)) {
        throw new Error(`mediaPool: bin id '${def.id}' already exists`);
      }
      return { customBins: [...state.customBins, def] };
    });
  },
  removeBin: (binId) =>
    set((state) => ({
      customBins: state.customBins.filter((b) => b.id !== binId),
      activeBinId: state.activeBinId === binId ? 'bin-all' : state.activeBinId,
    })),
  setActiveBin: (binId) => set({ activeBinId: binId }),
  relinkAsset: (assetId, newPath) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === assetId ? { ...a, path: newPath, isOffline: false } : a
      ),
    })),
}));
