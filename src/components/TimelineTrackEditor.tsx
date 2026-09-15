import React, { useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { Scissors, ZoomIn, ZoomOut, Lock, MousePointer, MoveHorizontal, ArrowLeftRight, Film, Music, Activity } from 'lucide-react';

export type EditingTool = 'select' | 'blade' | 'slip' | 'slide';

export const TimelineTrackEditor: React.FC = () => {
  const [activeTool, setActiveTool] = useState<EditingTool>('select');
  const [trackStates, setTrackStates] = useState<Record<string, { mute: boolean; solo: boolean; lock: boolean }>>({
    track_v2: { mute: false, solo: false, lock: false },
    track_v1: { mute: false, solo: false, lock: false },
    track_a1: { mute: false, solo: false, lock: false },
    track_a2: { mute: false, solo: false, lock: false },
  });

  const {
    tracks,
    playheadPosition,
    zoomLevel,
    selectedClipIds,
    setPlayheadPosition,
    setZoomLevel,
    selectClip,
  } = useTimelineStore();

  const totalDuration = 60; // 60 seconds view window

  const toggleTrackState = (trackId: string, key: 'mute' | 'solo' | 'lock') => {
    setTrackStates((prev) => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [key]: !prev[trackId]?.[key],
      },
    }));
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = clickX / zoomLevel;
    setPlayheadPosition(Math.max(0, newTime));
  };

  const tools: { id: EditingTool; label: string; icon: React.ReactNode; key: string }[] = [
    { id: 'select', label: 'Select', icon: <MousePointer className="w-3.5 h-3.5" />, key: 'V' },
    { id: 'blade', label: 'Blade', icon: <Scissors className="w-3.5 h-3.5" />, key: 'C' },
    { id: 'slip', label: 'Slip', icon: <MoveHorizontal className="w-3.5 h-3.5" />, key: 'Y' },
    { id: 'slide', label: 'Slide', icon: <ArrowLeftRight className="w-3.5 h-3.5" />, key: 'U' },
  ];

  return (
    <div className="h-68 bg-neutral-900 border-t border-neutral-800/80 flex flex-col select-none text-xs">
      {/* Timeline Controls Toolbar */}
      <div className="h-10 bg-neutral-950/60 border-b border-neutral-800/80 flex items-center justify-between px-3 text-neutral-400">
        {/* Editing Tools Selector */}
        <div className="flex items-center space-x-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-all text-[11px] font-medium ${
                activeTool === tool.id
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold shadow'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
              }`}
              title={`${tool.label} Tool (${tool.key})`}
            >
              {tool.icon}
              <span>{tool.label} <span className="text-[9px] opacity-60 font-mono">({tool.key})</span></span>
            </button>
          ))}
        </div>

        {/* Zoom & Track Controls */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 bg-neutral-950 px-2 py-1 rounded-lg border border-neutral-800">
            <ZoomOut
              className="w-3.5 h-3.5 hover:text-white cursor-pointer transition-colors"
              onClick={() => setZoomLevel(Math.max(5, zoomLevel - 5))}
            />
            <input
              type="range"
              min="5"
              max="100"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(Number(e.target.value))}
              className="w-24 accent-indigo-500 h-1 bg-neutral-800 rounded-lg cursor-pointer"
            />
            <ZoomIn
              className="w-3.5 h-3.5 hover:text-white cursor-pointer transition-colors"
              onClick={() => setZoomLevel(Math.min(100, zoomLevel + 5))}
            />
          </div>
        </div>
      </div>

      {/* Track List + Timeline Canvas View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Track Headers */}
        <div className="w-60 bg-neutral-900 border-r border-neutral-800/80 flex flex-col divide-y divide-neutral-800/60 z-10 shadow-lg">
          {tracks.map((track) => {
            const st = trackStates[track.id] || { mute: false, solo: false, lock: false };
            return (
              <div
                key={track.id}
                style={{ height: `${track.height}px` }}
                className="flex items-center justify-between px-3 bg-neutral-900/90 hover:bg-neutral-850 transition-colors"
              >
                <div className="flex items-center space-x-2 font-semibold text-neutral-300 text-[11px] truncate">
                  {track.type === 'video' ? (
                    <Film className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  ) : (
                    <Music className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">{track.name}</span>
                </div>

                {/* Track Controls M/S/L */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => toggleTrackState(track.id, 'mute')}
                    className={`w-5 h-5 rounded text-[10px] font-bold transition-all ${
                      st.mute ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-500 hover:text-neutral-300 border border-neutral-800'
                    }`}
                    title="Mute Track"
                  >
                    M
                  </button>
                  <button
                    onClick={() => toggleTrackState(track.id, 'solo')}
                    className={`w-5 h-5 rounded text-[10px] font-bold transition-all ${
                      st.solo ? 'bg-yellow-500 text-black' : 'bg-neutral-950 text-neutral-500 hover:text-neutral-300 border border-neutral-800'
                    }`}
                    title="Solo Track"
                  >
                    S
                  </button>
                  <button
                    onClick={() => toggleTrackState(track.id, 'lock')}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                      st.lock ? 'bg-indigo-600 text-white' : 'bg-neutral-950 text-neutral-500 hover:text-neutral-300 border border-neutral-800'
                    }`}
                    title="Lock Track"
                  >
                    <Lock className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Tracks Sequence Canvas Area */}
        <div
          className="flex-1 bg-neutral-950 overflow-x-auto relative divide-y divide-neutral-800/40"
          onClick={handleTimelineClick}
        >
          {/* Timecode Ruler Bar */}
          <div className="h-6 bg-neutral-900/80 border-b border-neutral-800/80 sticky top-0 flex items-center font-mono text-[10px] text-neutral-500 z-10">
            {Array.from({ length: Math.ceil(totalDuration) }).map((_, sec) => (
              <div
                key={sec}
                style={{ width: `${zoomLevel}px` }}
                className="border-l border-neutral-800/60 pl-1 shrink-0 relative h-full flex items-center"
              >
                {sec % 5 === 0 ? <span className="font-semibold text-neutral-400">{sec}s</span> : ''}
              </div>
            ))}
          </div>

          {/* Tracks Clips Grid */}
          {tracks.map((track) => (
            <div
              key={track.id}
              style={{ height: `${track.height}px` }}
              className="relative w-full border-b border-neutral-900/80"
            >
              {track.clips.map((clip) => {
                const isSelected = selectedClipIds.includes(clip.id);
                return (
                  <div
                    key={clip.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectClip(clip.id);
                    }}
                    style={{
                      left: `${clip.startOffset * zoomLevel}px`,
                      width: `${clip.duration * zoomLevel}px`,
                    }}
                    className={`absolute top-1 bottom-1 rounded-lg px-2.5 flex items-center justify-between text-[11px] font-semibold truncate cursor-pointer transition-all shadow-md group ${
                      track.type === 'video'
                        ? isSelected
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white ring-2 ring-indigo-300 shadow-indigo-500/30'
                          : 'bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-100 border border-indigo-700/60'
                        : isSelected
                        ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white ring-2 ring-emerald-300 shadow-emerald-500/30'
                        : 'bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-100 border border-emerald-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {track.type === 'audio' ? (
                        <Activity className="w-3.5 h-3.5 text-emerald-400/80 shrink-0" />
                      ) : (
                        <Film className="w-3.5 h-3.5 text-indigo-300/80 shrink-0" />
                      )}
                      <span className="truncate">{clip.name}</span>
                    </div>

                    <span className="text-[9px] opacity-80 font-mono ml-2 shrink-0 bg-neutral-950/50 px-1 py-0.5 rounded border border-white/10">
                      {clip.duration.toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Scrubbing Playhead Line & Badge */}
          <div
            style={{ left: `${playheadPosition * zoomLevel}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
          >
            <div className="w-3 h-3 bg-red-500 -ml-1 rotate-45 transform -translate-y-1 shadow-md" />
            <div className="absolute top-0 left-2 bg-red-600 text-white text-[9px] font-mono px-1 rounded shadow font-bold">
              {playheadPosition.toFixed(2)}s
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
