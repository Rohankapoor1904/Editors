import React, { useState, useEffect, useRef } from 'react';
import { Film, Music, FileText, Search, LayoutGrid, List, Plus, Play, Link2Off } from 'lucide-react';
import { nativeBridge } from '../services/nativeBridge';
import { useMediaPoolStore, MediaAsset } from '../store/mediaPool';
import { useTimelineStore } from '../store/timelineStore';
import { secondsToRational } from '../types/time';
import { Clip } from '../types/timeline';

export interface AssetBinProps {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const AssetBin: React.FC<AssetBinProps> = ({ width, className = '', style }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'ai'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scrubPosition, setScrubPosition] = useState<{ [assetId: string]: number }>({});

  const { assets, addAsset, updateAssetStatus, relinkAsset, selectedAssetId, selectAsset } = useMediaPoolStore();

  // Optionally periodic check for offline files.
  // In a real app we might watch files or check on focus.
  useEffect(() => {
    const checkOfflineStatus = async () => {
      for (const asset of assets) {
        try {
          const exists = await nativeBridge.checkFileExists(asset.path);
          if (asset.isOffline !== !exists) {
            updateAssetStatus(asset.id, !exists);
          }
        } catch (err) {
          console.warn('Failed to check file existence', err);
        }
      }
    };
    checkOfflineStatus();
    const interval = setInterval(checkOfflineStatus, 5000);
    return () => clearInterval(interval);
  }, [assets, updateAssetStatus]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addClipToTrack, tracks } = useTimelineStore();

  const handleImportMedia = async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const meta = await nativeBridge.importMediaFile('');
        if (meta) {
          const fingerprint = await nativeBridge.getFileFingerprint(meta.path);
          const isOffline = !(await nativeBridge.checkFileExists(meta.path));

          const newAsset: MediaAsset = {
            id: `asset_${Date.now()}`,
            name: meta.filename,
            path: meta.path,
            type: meta.hasAudio && !meta.width ? 'audio' : 'video',
            duration: `00:00:${Math.floor(meta.durationSeconds).toString().padStart(2, '0')}`,
            badge: meta.codec,
            fps: meta.fps ? String(meta.fps) : undefined,
            resolution: meta.width ? `${meta.width}x${meta.height}` : undefined,
            fingerprint,
            isOffline,
            thumbnailUrl: meta.thumbnailDataUrl,
          };

          addAsset(newAsset);
          selectAsset(newAsset.id);
        }
      } catch (err) {
        console.error('Failed to import media file:', err);
      }
    } else {
      // Web fallback
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isAudio = file.type.startsWith('audio/');
      const objectUrl = URL.createObjectURL(file);

      // Extract duration and dimensions
      const mediaElement = isAudio ? new Audio(objectUrl) : document.createElement('video');
      mediaElement.src = objectUrl;

      await new Promise((resolve) => {
        mediaElement.addEventListener('loadedmetadata', resolve, { once: true });
        mediaElement.addEventListener('error', resolve, { once: true }); // Fallback if it fails to load
      });

      const durationSeconds = mediaElement.duration || 0;
      let width, height;
      if (!isAudio) {
        width = (mediaElement as HTMLVideoElement).videoWidth;
        height = (mediaElement as HTMLVideoElement).videoHeight;
      }

      const newAsset: MediaAsset = {
        id: `asset_${Date.now()}_${i}`,
        name: file.name,
        path: objectUrl,
        type: isAudio ? 'audio' : 'video',
        duration: `00:00:${Math.floor(durationSeconds).toString().padStart(2, '0')}`,
        badge: 'web',
        fps: undefined,
        resolution: width ? `${width}x${height}` : undefined,
        fingerprint: `${file.name}-${file.size}-${file.lastModified}`,
        isOffline: false,
      };

      addAsset(newAsset);
    }

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddToTimeline = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();

    // Find a suitable track
    const targetTrack = tracks.find(t => t.type === asset.type);
    if (!targetTrack) {
      console.warn('No suitable track found for asset type', asset.type);
      return;
    }

    // Parse duration string back to seconds (basic implementation for the format 00:00:SS)
    const durationParts = asset.duration.split(':').map(Number);
    const durationSeconds = (durationParts[0] || 0) * 3600 + (durationParts[1] || 0) * 60 + (durationParts[2] || 0);

    const clipDuration = secondsToRational(durationSeconds > 0 ? durationSeconds : 5); // Default to 5s if unknown

    const newClip: Clip = {
      id: `clip_${Date.now()}`,
      assetId: asset.id,
      name: asset.name,
      startOffset: secondsToRational(0), // Would normally be at playhead, but timeline track editor expects something
      sourceIn: secondsToRational(0),
      sourceOut: clipDuration,
      duration: clipDuration,
    };

    // Put it at playhead position, or max end of track
    let maxEnd = 0;
    for (const clip of targetTrack.clips) {
       const endSec = clip.startOffset.value / clip.startOffset.rate + clip.duration.value / clip.duration.rate;
       if (endSec > maxEnd) maxEnd = endSec;
    }

    newClip.startOffset = secondsToRational(maxEnd);

    addClipToTrack(targetTrack.id, newClip);
  };


  const handleRelink = async (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();
    // Prompt the user for a new file. If in `demo` mode, nativeBridge will mock the UI.
    const meta = await nativeBridge.importMediaFile(''); // Empty string instructs the backend to open file dialog if possible
    if (meta) {
       const newFingerprint = await nativeBridge.getFileFingerprint(meta.path);
       if (newFingerprint === asset.fingerprint) {
         relinkAsset(asset.id, meta.path);
       } else {
         console.warn('Relink failed: New file fingerprint does not match original asset.');
         // Optionally you'd show a toast notification here.
       }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, assetId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setScrubPosition((prev) => ({ ...prev, [assetId]: percentage }));
  };

  const handleMouseLeave = (assetId: string) => {
    setScrubPosition((prev) => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesFilter = filter === 'all' || asset.type === filter;
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div
      style={{
        width: width ? `${width}px` : undefined,
        minWidth: width ? `${width}px` : undefined,
        maxWidth: width ? `${width}px` : undefined,
        ...style,
      }}
      className={`bg-dark-900 border-r border-subtle flex flex-col h-full select-none text-xs shrink-0 ${!width ? 'w-80' : ''} ${className}`}
    >

      {/* Hidden file input for web fallback */}
      <input
        type="file"
        data-testid="hidden-file-input"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept="video/*,audio/*"
      />

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-subtle px-3 py-2.5 bg-dark-950/60">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-neutral-100 text-xs tracking-wide">Project Bin</span>
          <span className="px-1.5 py-0.5 rounded-full bg-dark-800 text-[10px] text-neutral-400 font-mono font-medium border border-subtle">
            {filteredAssets.length}
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
          <div className="flex bg-dark-950 p-0.5 rounded-panel border border-subtle">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'grid' ? 'bg-dark-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3 h-3" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1 rounded transition-colors ${
                viewMode === 'list' ? 'bg-dark-800 text-white' : 'text-neutral-500 hover:text-neutral-300'
              }`}
              title="List View"
            >
              <List className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={handleImportMedia}
            className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-accent hover:bg-indigo-hover text-white rounded-panel text-[11px] font-medium shadow transition-all hover:scale-[1.02]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* Search & Category Filter Pills */}
      <div className="p-2 border-b border-subtle space-y-2 bg-dark-950/40">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-neutral-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets, clips, tags..."
            className="w-full bg-dark-950 text-neutral-200 text-xs pl-8 pr-2 py-1.5 rounded-panel border border-subtle focus:outline-none focus:border-indigo-accent placeholder-neutral-500 transition-colors"
          />
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto text-[10px] font-medium pb-0.5 no-scrollbar">
          {(['all', 'video', 'audio', 'ai'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2.5 py-1 rounded-full capitalize transition-all whitespace-nowrap ${
                filter === cat
                  ? 'bg-indigo-accent text-white shadow-sm font-semibold'
                  : 'bg-dark-950 text-neutral-400 border border-subtle hover:text-neutral-200 hover:bg-dark-800'
              }`}
            >
              {cat === 'ai' ? '✨ AI Generated' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Grid or List Area */}
      <div className="flex-1 overflow-y-auto p-2 bg-dark-950">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map((asset) => {
              const scrubPct = scrubPosition[asset.id];
              const isScrubbing = scrubPct !== undefined && (asset.type === 'video' || asset.type === 'ai');

              return (
                <div
                  key={asset.id}
                  draggable={true}
                  onClick={(e) => { e.stopPropagation(); selectAsset(asset.id); }}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", asset.id); }}
                  onMouseMove={(e) => handleMouseMove(e, asset.id)}
                  onMouseLeave={() => handleMouseLeave(asset.id)}
                  className={`group relative bg-dark-900 border ${asset.id === selectedAssetId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-subtle hover:border-indigo-accent/80'} rounded-panel p-2 transition-all duration-150 cursor-pointer shadow hover:shadow-indigo-500/10 flex flex-col justify-between`}
                >
                  {/* Thumbnail Graphic Representation with Hover Scrub */}
                  <div className="w-full h-20 bg-dark-950 rounded border border-subtle overflow-hidden relative flex items-center justify-center">
                    {/* Scrubbing Background Visual Layer */}
                    <div
                      className="absolute inset-0 transition-all duration-75"
                      style={{
                        background: isScrubbing
                          ? `linear-gradient(to right, rgba(99, 102, 241, 0.4) ${scrubPct}%, rgba(18, 18, 20, 0.9) ${scrubPct}%)`
                          : undefined,
                      }}
                    />

                    {asset.type === 'video' || asset.type === 'ai' ? (
                      <div className="w-full h-full bg-gradient-to-br from-dark-850 via-indigo-950/40 to-dark-900 flex items-center justify-center relative z-10">
                        {isScrubbing ? (
                          <div className="flex flex-col items-center">
                            <Play className="w-5 h-5 text-indigo-300 animate-pulse" />
                            <span className="text-[9px] font-mono tabular-nums text-indigo-200 mt-1 bg-dark-950/80 px-1 py-0.5 rounded">
                              {(scrubPct * 0.6).toFixed(1)}s
                            </span>
                          </div>
                        ) : asset.thumbnailUrl ? (
                          <img
                            src={asset.thumbnailUrl}
                            alt={asset.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <Film className="w-6 h-6 text-indigo-accent group-hover:scale-110 transition-transform" />
                        )}
                      </div>
                    ) : asset.type === 'audio' ? (
                      <div className="w-full h-full bg-gradient-to-br from-dark-850 via-emerald-950/40 to-dark-900 flex items-center justify-center">
                        <Music className="w-6 h-6 text-teal-accent group-hover:scale-110 transition-transform" />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-dark-850 via-amber-950/40 to-dark-900 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-amber-400" />
                      </div>
                    )}

                    {/* Hover Scrub Vertical Cursor Line */}
                    {isScrubbing && (
                      <div
                        style={{ left: `${scrubPct}%` }}
                        className="absolute top-0 bottom-0 w-0.5 bg-indigo-400 z-20 pointer-events-none shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                      />
                    )}

                    {asset.isOffline ? (
                       <button
                         onClick={(e) => handleRelink(e, asset)}
                         className="absolute top-1 left-1 bg-red-950/90 text-[9px] font-medium px-1.5 py-0.5 rounded text-red-400 border border-red-900/50 backdrop-blur z-20 flex items-center space-x-1 hover:bg-red-900"
                       >
                         <Link2Off className="w-3 h-3" />
                         <span>Relink</span>
                       </button>
                    ) : asset.badge && (
                      <span className="absolute top-1 left-1 bg-dark-950/90 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded text-neutral-300 border border-subtle backdrop-blur z-20">
                        {asset.badge}
                      </span>
                    )}


                    <button
                      onClick={(e) => handleAddToTimeline(e, asset)}
                      className="absolute bottom-1 left-1 bg-dark-950/90 hover:bg-indigo-900 text-[9px] font-medium px-1.5 py-0.5 rounded text-indigo-300 border border-indigo-900/50 backdrop-blur z-20 flex items-center space-x-1 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <span className="absolute bottom-1 right-1 bg-dark-950/90 text-[9px] font-mono px-1 py-0.5 rounded text-neutral-400 border border-subtle z-20">
                      {asset.duration}
                    </span>
                  </div>

                  <div className="mt-2 flex justify-between items-start">
                    <div className="overflow-hidden">
                      <div className={`font-medium text-xs truncate group-hover:text-white ${asset.isOffline ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>
                        {asset.name}
                      </div>
                      {asset.resolution && (
                        <div className="text-[10px] text-neutral-500 font-mono tabular-nums">
                          {asset.resolution} {asset.fps ? `• ${asset.fps}fps` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                draggable={true}
                onClick={(e) => { e.stopPropagation(); selectAsset(asset.id); }}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", asset.id); }}
                className={`flex items-center justify-between p-2 rounded-panel bg-dark-900 border hover:border-indigo-accent/80 hover:bg-dark-850 cursor-pointer transition-all ${asset.isOffline ? 'border-red-900/30' : asset.id === selectedAssetId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-subtle'}`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  {asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      alt={asset.name}
                      className="w-6 h-6 rounded object-cover shrink-0 border border-subtle"
                    />
                  ) : asset.type === 'video' || asset.type === 'ai' ? (
                    <Film className="w-4 h-4 text-indigo-accent shrink-0" />
                  ) : asset.type === 'audio' ? (
                    <Music className="w-4 h-4 text-teal-accent shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <div className="truncate">
                    <div className={`font-medium text-xs truncate ${asset.isOffline ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>{asset.name}</div>
                    <div className="text-[9px] text-neutral-500 font-mono">{asset.badge || asset.type}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {asset.isOffline && (
                    <button
                      onClick={(e) => handleRelink(e, asset)}
                      className="px-2 py-0.5 bg-red-950/50 hover:bg-red-900 text-red-400 rounded text-[9px] border border-red-900/50 flex items-center space-x-1"
                    >
                      <Link2Off className="w-3 h-3" />
                      <span>Relink</span>
                    </button>
                  )}

                  <button
                    onClick={(e) => handleAddToTimeline(e, asset)}
                    className="px-2 py-0.5 bg-dark-800 hover:bg-indigo-900 text-indigo-300 rounded text-[9px] border border-subtle hover:border-indigo-500/50 flex items-center space-x-1"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] text-neutral-400 font-mono tabular-nums shrink-0 ml-2">
                    {asset.duration}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
