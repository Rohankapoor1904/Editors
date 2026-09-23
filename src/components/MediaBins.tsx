import React from 'react';
import { useMediaPoolStore } from '../store/mediaPool';
import { BUILTIN_BINS, resolveBin, BinDefinition } from '../store/mediaBins';
import { FolderOpen, Plus, X, Star } from 'lucide-react';

/**
 * R24.7 — smart bins strip: built-in bins (never persisted) plus user
 * custom bins, each with a live count. Selecting a bin filters the asset
 * grid below (AssetBin combines the bin predicate with its own search).
 */
export const MediaBins: React.FC = () => {
  const { assets, customBins, activeBinId, setActiveBin, addBin, removeBin } = useMediaPoolStore();
  const [newName, setNewName] = React.useState('');
  const [newPreset, setNewPreset] = React.useState('favorites');
  const [error, setError] = React.useState<string | null>(null);

  const allBins: BinDefinition[] = [...BUILTIN_BINS, ...customBins];
  const countFor = (def: BinDefinition): number => {
    try {
      return resolveBin(assets, def).length;
    } catch {
      return 0;
    }
  };

  // Scroll fade affordance: the strip hides its scrollbar, so show an edge
  // fade only while there is actually more to scroll to (e.g. "Offlin…").
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [showFade, setShowFade] = React.useState(false);
  const updateFade = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowFade(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);
  React.useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, [updateFade, assets.length, allBins.length]);

  const handleAdd = (): void => {
    setError(null);
    const presets: Record<string, BinDefinition['filters']> = {
      favorites: [{ field: 'rating', op: 'gte', value: 4 }],
      video: [{ field: 'type', op: 'eq', value: 'video' }],
      offline: [{ field: 'offline', op: 'eq', value: true }],
    };
    try {
      addBin({
        id: `bin_${Date.now()}`,
        name: newName.trim() || 'Untitled Bin',
        filters: presets[newPreset] ?? presets.favorites,
      });
      setNewName('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="border-b border-subtle bg-dark-950/40 px-2 py-1.5 space-y-1.5">
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateFade}
          className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px] font-medium py-0.5"
        >
          <FolderOpen className="w-3 h-3 text-neutral-500 shrink-0" />
          {allBins.map((bin) => {
            const isActive = activeBinId === bin.id;
            return (
              <span key={bin.id} className="flex items-center shrink-0">
                <button
                  onClick={() => setActiveBin(bin.id)}
                  title={`${bin.name} (${countFor(bin)})`}
                  aria-pressed={isActive}
                  className={`px-2 py-0.5 rounded-full whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-indigo-accent border-indigo-accent text-white font-semibold shadow-sm'
                      : 'bg-dark-900 text-neutral-400 border-subtle/70 hover:text-neutral-100 hover:border-indigo-500/50'
                  }`}
                >
                  {bin.name}{' '}
                  <span className={isActive ? 'text-white/70 font-mono' : 'text-neutral-600 font-mono'}>
                    · {countFor(bin)}
                  </span>
                </button>
                {!BUILTIN_BINS.some((b) => b.id === bin.id) && (
                  <button
                    onClick={() => removeBin(bin.id)}
                    title={`Remove ${bin.name}`}
                    aria-label={`Remove bin ${bin.name}`}
                    className="text-neutral-600 hover:text-red-400 px-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {showFade && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-dark-950 via-dark-950/60 to-transparent" />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          aria-label="New bin name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
          }}
          placeholder="New bin…"
          className="flex-1 min-w-0 bg-dark-950 text-neutral-200 text-[10px] px-2 py-1 rounded-md border border-subtle focus:outline-none focus:border-indigo-accent placeholder-neutral-600"
        />
        <select
          aria-label="New bin preset"
          value={newPreset}
          onChange={(e) => setNewPreset(e.target.value)}
          className="bg-dark-950 text-neutral-300 text-[10px] rounded-md px-1.5 py-1 border border-subtle focus:outline-none focus:border-indigo-accent shrink-0"
        >
          <option value="favorites">★ Favorites</option>
          <option value="video">Video only</option>
          <option value="offline">Offline</option>
        </select>
        <button
          onClick={handleAdd}
          title="Add bin"
          aria-label="Add bin"
          className="p-1 rounded-md border border-subtle text-neutral-400 hover:text-white hover:border-indigo-500/60 hover:bg-dark-800 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && <div className="text-[10px] text-red-400">{error}</div>}
    </div>
  );
};

/**
 * R24.7 — editorial metadata editor for the selected asset
 * (scene/take/rating/tags). Writes through the validated store action.
 */
export const AssetMetadataEditor: React.FC = () => {
  const { assets, selectedAssetId, updateAssetMetadata } = useMediaPoolStore();
  const asset = assets.find((a) => a.id === selectedAssetId) ?? null;
  const [tagsDraft, setTagsDraft] = React.useState<string | null>(null);

  if (!asset) return null;

  const setRating = (rating: number): void => {
    updateAssetMetadata(asset.id, { rating: asset.rating === rating ? 0 : rating });
  };

  return (
    <div className="border-t border-subtle bg-dark-950/60 px-3 py-2 space-y-1.5 text-[11px]">
      <div className="text-neutral-400 font-semibold uppercase tracking-wide text-[10px]">Metadata</div>
      <div className="flex items-center space-x-2">
        <span className="w-12 text-neutral-500">Scene</span>
        <input
          aria-label="Asset scene"
          value={asset.scene ?? ''}
          onChange={(e) => updateAssetMetadata(asset.id, { scene: e.target.value })}
          placeholder="e.g. SC3"
          className="flex-1 min-w-0 bg-dark-950 text-neutral-200 px-1.5 py-0.5 rounded border border-subtle focus:outline-none focus:border-indigo-accent"
        />
        <span className="w-8 text-neutral-500">Take</span>
        <input
          aria-label="Asset take"
          type="number"
          min={0}
          value={asset.take ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value);
            if (v === undefined) {
              updateAssetMetadata(asset.id, { take: 0 });
              return;
            }
            if (Number.isInteger(v) && v >= 0) updateAssetMetadata(asset.id, { take: v });
          }}
          className="w-14 bg-dark-950 text-neutral-200 px-1.5 py-0.5 rounded border border-subtle focus:outline-none focus:border-indigo-accent"
        />
      </div>
      <div className="flex items-center space-x-2">
        <span className="w-12 text-neutral-500">Rating</span>
        <div className="flex items-center space-x-0.5" role="group" aria-label="Asset rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              title={`Rate ${n}`}
              aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
              className={(asset.rating ?? 0) >= n ? 'text-amber-400' : 'text-neutral-600 hover:text-neutral-400'}
            >
              <Star className="w-3.5 h-3.5" fill="currentColor" />
            </button>
          ))}
        </div>
        <input
          aria-label="Asset tags"
          value={tagsDraft ?? (asset.tags ?? []).join(', ')}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={() => {
            const raw = tagsDraft ?? '';
            updateAssetMetadata(asset.id, {
              tags: raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0),
            });
            setTagsDraft(null);
          }}
          placeholder="Tags, comma separated"
          className="flex-1 min-w-0 bg-dark-950 text-neutral-200 px-1.5 py-0.5 rounded border border-subtle focus:outline-none focus:border-indigo-accent"
        />
      </div>
    </div>
  );
};
