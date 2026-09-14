import React, { useState } from 'react';
import { Film, Music, FileText, Wand2, Search, Upload } from 'lucide-react';
import { nativeBridge } from '../services/nativeBridge';
import { useTimelineStore } from '../store/timelineStore';

export const AssetBin: React.FC = () => {
  const [assets, setAssets] = useState([
    { id: '1', name: 'Interview_Take1.mp4', type: 'video', duration: '00:02:14', icon: <Film className="w-4 h-4 text-blue-400" /> },
    { id: '2', name: 'Product_Broll.mp4', type: 'video', duration: '00:00:45', icon: <Film className="w-4 h-4 text-blue-400" /> },
    { id: '3', name: 'Upbeat_Lofi_Beat.mp3', type: 'audio', duration: '00:03:12', icon: <Music className="w-4 h-4 text-green-400" /> },
    { id: '4', name: 'Transcript_Subtitles.srt', type: 'subtitle', duration: '00:02:14', icon: <FileText className="w-4 h-4 text-yellow-400" /> },
  ]);

  const { addClipToTrack, tracks } = useTimelineStore();

  const handleImportMedia = async () => {
    const meta = await nativeBridge.importMediaFile();
    if (meta) {
      const newAsset = {
        id: `asset_${Date.now()}`,
        name: meta.filename,
        type: meta.hasAudio ? 'video' : 'video',
        duration: `00:00:${Math.floor(meta.durationSeconds).toString().padStart(2, '0')}`,
        icon: <Film className="w-4 h-4 text-indigo-400" />,
      };
      setAssets((prev) => [newAsset, ...prev]);

      // Add imported clip automatically to V1 track
      const targetTrack = tracks.find((t) => t.id === 'track_v1') || tracks[0];
      if (targetTrack) {
        addClipToTrack(targetTrack.id, {
          id: `clip_${Date.now()}`,
          assetId: newAsset.id,
          name: meta.filename,
          startOffset: 25.0,
          sourceIn: 0.0,
          sourceOut: meta.durationSeconds,
          duration: meta.durationSeconds,
        });
      }
    }
  };

  return (
    <div className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full select-none">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300">
        <div className="flex space-x-3">
          <span className="text-white border-b-2 border-indigo-500 pb-1 cursor-pointer">Project Bin</span>
          <span className="text-neutral-500 hover:text-neutral-300 cursor-pointer flex items-center">
            <Wand2 className="w-3 h-3 mr-1 text-purple-400" /> AI Assets
          </span>
        </div>
        <button
          onClick={handleImportMedia}
          className="flex items-center space-x-1 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium"
          title="Import Local Media File"
        >
          <Upload className="w-3 h-3" />
          <span>Import</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-neutral-800">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-neutral-500" />
          <input
            type="text"
            placeholder="Search media..."
            className="w-full bg-neutral-950 text-neutral-200 text-xs pl-8 pr-2 py-1 rounded border border-neutral-800 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Media List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="flex items-center justify-between p-2 rounded hover:bg-neutral-800 cursor-pointer text-neutral-300 hover:text-white group border border-transparent hover:border-neutral-700"
          >
            <div className="flex items-center space-x-2.5 truncate">
              {asset.icon}
              <span className="truncate font-medium">{asset.name}</span>
            </div>
            <span className="text-[10px] text-neutral-500 group-hover:text-neutral-400 font-mono">
              {asset.duration}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
