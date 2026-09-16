import React, { useState } from 'react';
import { Film, Music, FileText, Search, LayoutGrid, List, Plus, Play } from 'lucide-react';
import { nativeBridge } from '../services/nativeBridge';
import { useTimelineStore } from '../store/timelineStore';
import { secondsToRational } from '../types/time';

interface Asset {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'subtitle' | 'ai';
  duration: string;
  badge?: string;
  fps?: string;
  resolution?: string;
}

export const AssetBin: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<'all' | 'video' | 'audio' | 'ai'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scrubPosition, setScrubPosition] = useState<{ [assetId: string]: number }>({});

  const [assets, setAssets] = useState<Asset[]>([
    { id: '1', name: 'Interview_Take1.mp4', type: 'video', duration: '00:02:14', badge: '4K H.264', resolution: '3840x2160', fps: '59.94' },
    { id: '2', name: 'Product_Broll.mp4', type: 'video', duration: '00:00:45', badge: '1080p', resolution: '1920x1080', fps: '60' },
    { id: '3', name: 'Upbeat_Lofi_Beat.mp3', type: 'audio', duration: '00:03:12', badge: '48kHz 24-bit' },
    { id: '4', name: 'Transcript_Subtitles.srt', type: 'subtitle', duration: '00:02:14', badge: 'Whisper AI' },
    { id: '5', name: 'AI_Generated_Broll.mp4', type: 'ai', duration: '00:00:15', badge: 'AI Generated', resolution: '1080x1920' },
  ]);

  const { addClipToTrack, tracks } = useTimelineStore();

  const handleImportMedia = async () => {
    const meta = await nativeBridge.importMediaFile();
    if (meta) {
      const newAsset: Asset = {
        id: `asset_${Date.now()}`,
        name: meta.filename,
        type: 'video',
        duration: `00:00:${Math.floor(meta.durationSeconds).toString().padStart(2, '0')}`,
        badge: 'Imported',
      };
      setAssets((prev) => [newAsset, ...prev]);

      const targetTrack = tracks.find((t) => t.id === 'track_v1') || tracks[0];
      if (targetTrack) {
        addClipToTrack(targetTrack.id, {
          id: `clip_${Date.now()}`,
          assetId: newAsset.id,
          name: meta.filename,
          startOffset: secondsToRational(25.0),
          sourceIn: secondsToRational(0.0),
          sourceOut: secondsToRational(meta.durationSeconds),
          duration: secondsToRational(meta.durationSeconds),
        });
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
    <div className="w-80 bg-dark-900 border-r border-subtle flex flex-col h-full select-none text-xs">
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
                  onMouseMove={(e) => handleMouseMove(e, asset.id)}
                  onMouseLeave={() => handleMouseLeave(asset.id)}
                  className="group relative bg-dark-900 border border-subtle hover:border-indigo-accent/80 rounded-panel p-2 transition-all duration-150 cursor-pointer shadow hover:shadow-indigo-500/10 flex flex-col justify-between"
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

                    {asset.badge && (
                      <span className="absolute top-1 left-1 bg-dark-950/90 text-[9px] font-mono font-medium px-1.5 py-0.5 rounded text-neutral-300 border border-subtle backdrop-blur z-20">
                        {asset.badge}
                      </span>
                    )}

                    <span className="absolute bottom-1 right-1 bg-dark-950/90 text-[9px] font-mono px-1 py-0.5 rounded text-neutral-400 border border-subtle z-20">
                      {asset.duration}
                    </span>
                  </div>

                  <div className="mt-2">
                    <div className="font-medium text-neutral-200 text-xs truncate group-hover:text-white">
                      {asset.name}
                    </div>
                    {asset.resolution && (
                      <div className="text-[10px] text-neutral-500 font-mono tabular-nums">
                        {asset.resolution} {asset.fps ? `• ${asset.fps}fps` : ''}
                      </div>
                    )}
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
                className="flex items-center justify-between p-2 rounded-panel bg-dark-900 border border-subtle hover:border-indigo-accent/80 hover:bg-dark-850 cursor-pointer transition-all"
              >
                <div className="flex items-center space-x-2.5 truncate">
                  {asset.type === 'video' || asset.type === 'ai' ? (
                    <Film className="w-4 h-4 text-indigo-accent shrink-0" />
                  ) : asset.type === 'audio' ? (
                    <Music className="w-4 h-4 text-teal-accent shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <div className="truncate">
                    <div className="font-medium text-neutral-200 text-xs truncate">{asset.name}</div>
                    <div className="text-[9px] text-neutral-500 font-mono">{asset.badge || asset.type}</div>
                  </div>
                </div>

                <span className="text-[10px] text-neutral-400 font-mono tabular-nums shrink-0 ml-2">
                  {asset.duration}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
