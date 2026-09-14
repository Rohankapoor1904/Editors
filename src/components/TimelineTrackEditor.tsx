import React, { useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { Scissors, ZoomIn, ZoomOut, Eye, Lock, Volume2, MousePointer, MoveHorizontal, ArrowLeftRight } from 'lucide-react';

export type EditingTool = 'select' | 'blade' | 'slip' | 'slide';

export const TimelineTrackEditor: React.FC = () => {
  const [activeTool, setActiveTool] = useState<EditingTool>('select');

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

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = clickX / zoomLevel;
    setPlayheadPosition(newTime);
  };

  const tools: { id: EditingTool; label: string; icon: React.ReactNode; key: string }[] = [
    { id: 'select', label: 'Select', icon: <MousePointer className="w-3.5 h-3.5" />, key: 'V' },
    { id: 'blade', label: 'Blade', icon: <Scissors className="w-3.5 h-3.5" />, key: 'C' },
    { id: 'slip', label: 'Slip', icon: <MoveHorizontal className="w-3.5 h-3.5" />, key: 'Y' },
    { id: 'slide', label: 'Slide', icon: <ArrowLeftRight className="w-3.5 h-3.5" />, key: 'U' },
  ];

  return (
    <div className="h-64 bg-neutral-900 border-t border-neutral-800 flex flex-col select-none text-xs">
      {/* Timeline Controls Toolbar */}
      <div className="h-9 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-3 text-neutral-400">
        {/* Editing Tools Selector */}
        <div className="flex items-center space-x-1 bg-neutral-950 p-1 rounded border border-neutral-800">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                activeTool === tool.id
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title={`${tool.label} Tool (${tool.key})`}
            >
              {tool.icon}
              <span>{tool.label} ({tool.key})</span>
            </button>
          ))}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center space-x-2">
          <ZoomOut
            className="w-3.5 h-3.5 hover:text-white cursor-pointer"
            onClick={() => setZoomLevel(zoomLevel - 5)}
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
            className="w-3.5 h-3.5 hover:text-white cursor-pointer"
            onClick={() => setZoomLevel(zoomLevel + 5)}
          />
        </div>
      </div>

      {/* Track List + Timeline Canvas View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Track Headers */}
        <div className="w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col divide-y divide-neutral-800/60 z-10">
          {tracks.map((track) => (
            <div
              key={track.id}
              style={{ height: `${track.height}px` }}
              className="flex items-center justify-between px-3 bg-neutral-900/80 hover:bg-neutral-850"
            >
              <div className="flex items-center space-x-2 font-medium text-neutral-300 truncate">
                <span className="truncate">{track.name}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-neutral-500">
                <Eye className="w-3.5 h-3.5 hover:text-neutral-200 cursor-pointer" />
                <Lock className="w-3.5 h-3.5 hover:text-neutral-200 cursor-pointer" />
                <Volume2 className="w-3.5 h-3.5 hover:text-neutral-200 cursor-pointer" />
              </div>
            </div>
          ))}
        </div>

        {/* Right Tracks Sequence Canvas Area */}
        <div
          className="flex-1 bg-neutral-950 overflow-x-auto relative divide-y divide-neutral-800/40"
          onClick={handleTimelineClick}
        >
          {/* Timecode Ruler Bar */}
          <div className="h-6 bg-neutral-900/60 border-b border-neutral-800 sticky top-0 flex items-center font-mono text-[10px] text-neutral-500">
            {Array.from({ length: Math.ceil(totalDuration) }).map((_, sec) => (
              <div
                key={sec}
                style={{ width: `${zoomLevel}px` }}
                className="border-l border-neutral-800/60 pl-1 shrink-0"
              >
                {sec % 5 === 0 ? `${sec}s` : ''}
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
                    className={`absolute top-1 bottom-1 rounded px-2 flex items-center justify-between text-[11px] font-medium truncate cursor-pointer transition-all shadow ${
                      track.type === 'video'
                        ? isSelected
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                          : 'bg-indigo-900/80 hover:bg-indigo-800 text-indigo-100 border border-indigo-700/50'
                        : isSelected
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                        : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-800/50'
                    }`}
                  >
                    <span className="truncate">{clip.name}</span>
                    <span className="text-[9px] opacity-70 font-mono ml-1">{clip.duration.toFixed(1)}s</span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Scrubbing Playhead Line */}
          <div
            style={{ left: `${playheadPosition * zoomLevel}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
          >
            <div className="w-3 h-3 bg-red-500 -ml-1 rotate-45 transform -translate-y-1.5 shadow" />
          </div>
        </div>
      </div>
    </div>
  );
};
