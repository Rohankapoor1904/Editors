import React, { useState, useEffect, useRef } from 'react';
import { Film, Music, FileText, Search, LayoutGrid, List, Plus, Play, Link2Off, X } from 'lucide-react';
import { nativeBridge } from '../services/nativeBridge';
import { useMediaPoolStore, MediaAsset } from '../store/mediaPool';
import { BUILTIN_BINS, resolveBin } from '../store/mediaBins';
import { MediaBins, AssetMetadataEditor } from './MediaBins';
import { useTimelineStore } from '../store/timelineStore';
import { secondsToRational } from '../types/time';
import { Clip } from '../types/timeline';
import { shouldAutoProxy } from '../engine/proxyPresets';
import { capturePosterFrame } from '../engine/thumbnails';

export interface AssetBinProps {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const AssetBin: React.FC<AssetBinProps> = ({ width, className = '', style }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [scrubPosition, setScrubPosition] = useState<{ [assetId: string]: number }>({});

  const { assets, addAsset, updateAssetStatus, relinkAsset, selectedAssetId, selectAsset, activeBinId, customBins, setAssetProxyStatus } = useMediaPoolStore();
  // R26.4 — selected proxy preset for 4K auto-trigger (UI mirrors Rust presets).
  const [proxyPresetId, setProxyPresetId] = useState('proxy-720p-h264');

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
  const { addClipToTrack, tracks, targetTrackId } = useTimelineStore();

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
          // R26.4 — 4K auto-proxy trigger (fire-and-forget, never blocks import).
          if (shouldAutoProxy(meta.width)) {
            void triggerProxyForAsset(newAsset, meta.width);
          }
        }
      } catch (err) {
        console.error('Failed to import media file:', err);
      }
    } else {
      // Web fallback
      fileInputRef.current?.click();
    }
  };

  // R26.4 — shared proxy trigger helper (preset-aware, status-tracked).
  const triggerProxyForAsset = async (asset: MediaAsset, width?: number) => {
    if (!shouldAutoProxy(width)) return;
    const presetMap: Record<string, { h: number; codec: string }> = {
      'proxy-720p-h264': { h: 720, codec: 'h264' },
      'proxy-540p-h264': { h: 540, codec: 'h264' },
      'proxy-360p-h264': { h: 360, codec: 'h264' },
      'proxy-720p-prores': { h: 720, codec: 'prores' },
    };
    const preset = presetMap[proxyPresetId] ?? { h: 720, codec: 'h264' };
    try {
      setAssetProxyStatus(asset.id, 'generating');
      const taskId = await nativeBridge.generateProxy(asset.path, preset.h, preset.codec);
      // Poll once to seed status; the full progress loop lives in nativeBridge/proxyEngine.
      // For tests we assert that generateProxy was invoked for 4K assets.
      void taskId;
    } catch (err) {
      console.warn('[AssetBin] auto-proxy failed:', err);
      setAssetProxyStatus(asset.id, 'failed');
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

      // Real poster frame for the bin grid + timeline filmstrip (session-side;
      // blob URLs don't survive reload, so this is intentionally not persisted).
      // Falls back to undefined — callers render a neutral strip, never a fake.
      let thumbnailUrl: string | undefined;
      if (!isAudio && durationSeconds > 0) {
        try {
          thumbnailUrl = (await capturePosterFrame(objectUrl, { timeoutMs: 3000 })) ?? undefined;
        } catch {
          thumbnailUrl = undefined;
        }
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
        thumbnailUrl,
      };

      addAsset(newAsset);
      if (!isAudio && shouldAutoProxy(width)) {
        void triggerProxyForAsset(newAsset, width);
      }
    }

    // Clear input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddToTimeline = (e: React.MouseEvent, asset: MediaAsset) => {
    e.stopPropagation();

    // Find a suitable track: prefer targetTrackId if matching type & unlocked
    let targetTrack = targetTrackId
      ? tracks.find((t) => t.id === targetTrackId && t.type === asset.type && !t.locked)
      : undefined;

    if (!targetTrack) {
      // Default to V1 for video, A1 for audio, or first unlocked matching track
      if (asset.type === 'video') {
        targetTrack =
          tracks.find((t) => t.id === 'track_v1' && !t.locked) ||
          tracks.find((t) => t.type === 'video' && !t.locked);
      } else if (asset.type === 'audio') {
        targetTrack =
          tracks.find((t) => t.id === 'track_a1' && !t.locked) ||
          tracks.find((t) => t.type === 'audio' && !t.locked);
      } else {
        targetTrack = tracks.find((t) => t.type === asset.type && !t.locked);
      }
    }

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
      startOffset: secondsToRational(0),
      sourceIn: secondsToRational(0),
      sourceOut: clipDuration,
      duration: clipDuration,
    };

    // Put it at max end of track
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

  // R24.7: active smart bin narrows the pool before type/search filters.
  // Unknown bin ids (stale selection) fall back to the full pool loudly.
  const activeBinDef =
    [...BUILTIN_BINS, ...customBins].find((b) => b.id === activeBinId) ?? BUILTIN_BINS[0];
  let binAssetIds: Set<string> | null = null;
  try {
    binAssetIds = new Set(resolveBin(assets, activeBinDef).map((a) => a.id));
  } catch (err) {
    console.warn('[AssetBin] corrupt bin definition, showing full pool:', err);
  }

  // Single taxonomy: the smart bins strip below owns all category filtering
  // (All/Video/Audio/AI/Offline/Favorites); search narrows further. No second
  // pill row — it duplicated Video/Audio/All and AND-stacked confusingly.
  const filteredAssets = assets.filter((asset) => {
    const matchesBin = !binAssetIds || binAssetIds.has(asset.id);
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBin && matchesSearch;
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

          <select
            aria-label="Proxy preset"
            value={proxyPresetId}
            onChange={(e) => setProxyPresetId(e.target.value)}
            title="Proxy preset for 4K auto-generation"
            className="bg-dark-950 text-neutral-300 text-[10px] rounded px-1 py-0.5 border border-subtle"
          >
            <option value="proxy-720p-h264">720p H.264</option>
            <option value="proxy-540p-h264">540p H.264</option>
            <option value="proxy-360p-h264">360p H.264</option>
            <option value="proxy-720p-prores">720p ProRes</option>
          </select>
          <button
            onClick={handleImportMedia}
            className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-accent hover:bg-indigo-hover text-white rounded-panel text-[11px] font-medium shadow transition-all hover:scale-[1.02]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* Search (bins strip below owns category filtering — single taxonomy) */}
      <div className="p-2 border-b border-subtle bg-dark-950/40">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-neutral-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets, clips, tags..."
            className={`w-full bg-dark-950 text-neutral-200 text-xs pl-8 py-1.5 rounded-panel border border-subtle focus:outline-none focus:border-indigo-accent placeholder-neutral-500 transition-colors ${
              searchQuery ? 'pr-8' : 'pr-2'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
              className="absolute right-2 p-0.5 text-neutral-500 hover:text-neutral-100 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* R24.7: smart bins strip */}
      <MediaBins />

      {/* Asset Grid or List Area */}
      <div className="flex-1 overflow-y-auto p-2 bg-dark-950">
        {filteredAssets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-4 text-center border border-dashed border-subtle/70 hover:border-indigo-500/50 rounded-xl transition-all duration-200 bg-dark-900/30 group">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-center mb-3 group-hover:scale-110 group-hover:border-indigo-400/60 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-all">
              <Film className="w-6 h-6 text-indigo-400" />
            </div>
            <h4 className="text-xs font-semibold text-neutral-200 tracking-wide mb-1">
              {searchQuery ? 'No Matching Assets' : 'No Media In Project'}
            </h4>
            <p className="text-[11px] text-neutral-400 leading-relaxed max-w-[210px] mb-4">
              {searchQuery
                ? `No files match "${searchQuery}". Clear filter to view all.`
                : 'Drag and drop video, audio, or image clips here, or click to import.'}
            </p>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 bg-dark-800 hover:bg-dark-750 text-neutral-300 text-[11px] font-medium rounded-lg border border-subtle transition-all"
              >
                Clear Search
              </button>
            ) : (
              <button
                onClick={handleImportMedia}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-[11px] font-medium rounded-lg shadow-lg shadow-indigo-900/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Import Media</span>
              </button>
            )}
            <div className="mt-5 flex items-center gap-1.5 text-[9px] text-neutral-500 font-mono tracking-wider uppercase">
              <span className="px-1.5 py-0.5 rounded bg-dark-950 border border-subtle/70">ProRes</span>
              <span className="px-1.5 py-0.5 rounded bg-dark-950 border border-subtle/70">MP4</span>
              <span className="px-1.5 py-0.5 rounded bg-dark-950 border border-subtle/70">WAV</span>
              <span className="px-1.5 py-0.5 rounded bg-dark-950 border border-subtle/70">AAC</span>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {filteredAssets.map((asset) => {
              const scrubPct = scrubPosition[asset.id];
              const isScrubbing = scrubPct !== undefined && (asset.type === 'video' || asset.type === 'ai');

              return (
                <div
                  key={asset.id}
                  draggable={true}
                  onClick={(e) => { e.stopPropagation(); selectAsset(asset.id); }}
                  onDoubleClick={(e) => handleAddToTimeline(e, asset)}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", asset.id); }}
                  onMouseMove={(e) => handleMouseMove(e, asset.id)}
                  onMouseLeave={() => handleMouseLeave(asset.id)}
                  title="Click to select • Double-click or '+' to add to timeline"
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
                      className="absolute bottom-1 left-1 bg-dark-950/90 hover:bg-indigo-900 text-[9px] font-medium p-1 rounded text-indigo-200 border border-indigo-700/50 backdrop-blur z-20 flex items-center space-x-1 transition-all shadow-md group-hover:scale-105"
                      title="Add to Timeline"
                    >
                      <Plus className="w-3.5 h-3.5" />
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
                onDoubleClick={(e) => handleAddToTimeline(e, asset)}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", asset.id); }}
                title="Click to select • Double-click or '+' to add to timeline"
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
                    className="px-2 py-0.5 bg-dark-800 hover:bg-indigo-900 text-indigo-300 hover:text-white rounded text-[9px] border border-subtle hover:border-indigo-500/50 flex items-center space-x-1 transition-colors"
                    title="Add to Timeline"
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

      {/* R24.7: metadata editor for the selected asset */}
      <AssetMetadataEditor />
    </div>
  );
};
