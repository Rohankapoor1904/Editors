import React, { useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { Clip } from '../types/timeline';
import { rationalToSeconds, secondsToRational, addRational } from '../types/time';
import { Scissors, ZoomIn, ZoomOut, Lock, MousePointer, MoveHorizontal, ArrowLeftRight, Film, Music, Activity, GripVertical, ChevronDown, ListPlus, Trash2, SplitSquareHorizontal, VolumeX } from 'lucide-react';

export type EditingTool = 'select' | 'blade' | 'slip' | 'slide';

// Audio Waveform Generator Component
const AudioWaveform: React.FC<{ color: string }> = ({ color }) => {
  // Generate deterministic bar heights for a realistic audio waveform
  const barHeights = [
    30, 45, 80, 60, 90, 40, 20, 55, 75, 100, 85, 45, 65, 95, 30, 50,
    80, 70, 40, 90, 60, 85, 35, 75, 50, 90, 65, 40, 80, 95, 30, 60,
    70, 85, 45, 90, 55, 75, 100, 60, 40, 80, 50, 95, 70, 30, 85, 60
  ];

  return (
    <div className="absolute inset-0 flex items-center justify-around opacity-30 pointer-events-none px-1 overflow-hidden">
      {barHeights.map((h, i) => (
        <div
          key={i}
          style={{ height: `${h}%` }}
          className={`w-0.5 rounded-full ${color}`}
        />
      ))}
    </div>
  );
};

// Video Filmstrip Generator Component
const FilmstripPreview: React.FC = () => {
  return (
    <div className="absolute inset-0 flex items-center space-x-1 opacity-25 pointer-events-none overflow-hidden px-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-full w-12 bg-neutral-800/80 border border-neutral-700/50 rounded flex items-center justify-center shrink-0 overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/40 via-purple-900/30 to-neutral-900/60" />
          <Film className="w-3 h-3 text-indigo-300 opacity-60 z-10" />
          <div className="absolute bottom-0.5 left-0.5 right-0.5 h-0.5 bg-indigo-500/40 rounded-full" />
        </div>
      ))}
    </div>
  );
};

export const TimelineTrackEditor: React.FC = () => {
  const [activeTool, setActiveTool] = useState<EditingTool>('select');
  const [showAddTrackMenu, setShowAddTrackMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clipId: string;
    timeOffset: import('../types/time').RationalTime;
  } | null>(null);

  const {
    tracks,
    playheadPosition,
    zoomLevel,
    selectedClipIds,
    setPlayheadPosition,
    setZoomLevel,
    toggleTrackState,
    addTrack,
    selectClip,
    splitClip,
    trimClip,
    slipClip,
    slideClip,
    moveClip,
    removeClip,
    toggleClipMute
  } = useTimelineStore();

  const totalDuration = 60; // 60 seconds view window

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (contextMenu) setContextMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = clickX / zoomLevel;
    setPlayheadPosition(secondsToRational(Math.max(0, newTime)));
  };

  const handleClipClick = (e: React.MouseEvent<HTMLDivElement>, clipId: string) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);
    if (activeTool === 'select') {
      selectClip(clipId);
    } else if (activeTool === 'blade') {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const splitTimeOffset = clickX / zoomLevel;

      const track = tracks.find(t => t.clips.some(c => c.id === clipId));
      if (!track || track.locked) return;
      const clip = track.clips.find(c => c.id === clipId);
      if (!clip) return;

      const splitTime = addRational(clip.startOffset, secondsToRational(splitTimeOffset));

      try {
        splitClip(clipId, splitTime);
      } catch (err) {
        console.error("Failed to split clip", err);
      }
    }
  };

  const [dragState, setDragState] = useState<{
    clipId: string;
    type: 'trimIn' | 'trimOut' | 'slip' | 'slide' | 'move';
    startOffset?: import('../types/time').RationalTime;
    startX: number;
  } | null>(null);

  const handlePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    clipId: string,
    type: 'trimIn' | 'trimOut' | 'slip' | 'slide' | 'move'
  ) => {
    e.stopPropagation();
    if (contextMenu) setContextMenu(null);

    // Only allow operations if track is not locked
    const track = tracks.find(t => t.clips.some(c => c.id === clipId));
    if (track?.locked) return;

    const clip = track?.clips.find(c => c.id === clipId);
    setDragState({
      clipId,
      type,
      startX: e.clientX,
      startOffset: clip?.startOffset,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = () => {
    if (!dragState) return;
    // Visually update the dragging state here if needed
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);

    const deltaX = e.clientX - dragState.startX;
    if (Math.abs(deltaX) > 0) {
      const deltaSeconds = deltaX / zoomLevel;
      const delta = secondsToRational(deltaSeconds);

      try {
        if (dragState.type === 'trimIn') {
          trimClip(dragState.clipId, 'in', delta);
        } else if (dragState.type === 'trimOut') {
          trimClip(dragState.clipId, 'out', delta);
        } else if (dragState.type === 'slip') {
          slipClip(dragState.clipId, delta);
        } else if (dragState.type === 'slide') {
          slideClip(dragState.clipId, delta);
        } else if (dragState.type === 'move' && dragState.startOffset) {
          const newStartOffset = addRational(dragState.startOffset, delta);
          const trackId = tracks.find(t => t.clips.some(c => c.id === dragState.clipId))?.id;
          if (trackId) {
            moveClip(dragState.clipId, newStartOffset, trackId);
          }
        }
      } catch (err) {
        console.error(`Failed to apply ${dragState.type}`, err);
      }
    }

    setDragState(null);
  };

  const tools: { id: EditingTool; label: string; icon: React.ReactNode; key: string }[] = [
    { id: 'select', label: 'Select', icon: <MousePointer className="w-3.5 h-3.5" />, key: 'V' },
    { id: 'blade', label: 'Blade', icon: <Scissors className="w-3.5 h-3.5" />, key: 'C' },
    { id: 'slip', label: 'Slip', icon: <MoveHorizontal className="w-3.5 h-3.5" />, key: 'Y' },
    { id: 'slide', label: 'Slide', icon: <ArrowLeftRight className="w-3.5 h-3.5" />, key: 'U' },
  ];

  return (
    <div className="h-72 bg-dark-900 border-t border-subtle flex flex-col select-none text-xs">
      {/* Timeline Controls Toolbar */}
      <div className="h-10 bg-dark-950/80 border-b border-subtle flex items-center justify-between px-3 text-neutral-400">
        {/* Editing Tools Selector */}
        <div className="flex items-center space-x-1 bg-dark-900 p-1 rounded-panel border border-subtle">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition-all text-[11px] font-medium ${
                activeTool === tool.id
                  ? 'bg-gradient-to-r from-indigo-accent to-purple-600 text-white font-semibold shadow-md shadow-indigo-500/20'
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
        <div className="flex items-center space-x-3 relative">
          <div className="relative">
            <button
              onClick={() => setShowAddTrackMenu(!showAddTrackMenu)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-dark-900 border border-subtle hover:bg-neutral-800/80 rounded-panel transition-colors text-neutral-300 font-medium text-[11px]"
            >
              <ListPlus className="w-3.5 h-3.5 text-indigo-400" />
              <span>Add Track</span>
              <ChevronDown className="w-3 h-3 text-neutral-500" />
            </button>
            {showAddTrackMenu && (
              <div className="absolute top-full right-0 mt-1 w-36 bg-dark-900 border border-subtle shadow-xl rounded-md z-50 overflow-hidden divide-y divide-subtle">
                <button
                  className="w-full px-3 py-2 text-left hover:bg-indigo-950 flex items-center space-x-2 text-indigo-100 transition-colors"
                  onClick={() => {
                    addTrack('video');
                    setShowAddTrackMenu(false);
                  }}
                >
                  <Film className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Video Track</span>
                </button>
                <button
                  className="w-full px-3 py-2 text-left hover:bg-teal-950 flex items-center space-x-2 text-teal-100 transition-colors"
                  onClick={() => {
                    addTrack('audio');
                    setShowAddTrackMenu(false);
                  }}
                >
                  <Music className="w-3.5 h-3.5 text-teal-400" />
                  <span>Audio Track</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2 bg-dark-900 px-2.5 py-1 rounded-panel border border-subtle">
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
              className="w-24 accent-indigo-accent h-1 bg-neutral-800 rounded-lg cursor-pointer"
            />
            <ZoomIn
              className="w-3.5 h-3.5 hover:text-white cursor-pointer transition-colors"
              onClick={() => setZoomLevel(Math.min(100, zoomLevel + 5))}
            />
          </div>
        </div>
      </div>

      {/* Track List + Timeline Canvas View */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Track Headers */}
        <div className="w-60 bg-dark-900 border-r border-subtle flex flex-col divide-y divide-subtle z-10 shadow-xl">
          {tracks.map((track) => {
            return (
              <div
                key={track.id}
                style={{ height: `${track.height}px` }}
                className="flex items-center justify-between px-3 bg-dark-900/90 hover:bg-dark-850 transition-colors"
              >
                <div className="flex items-center space-x-2 font-semibold text-neutral-300 text-[11px] truncate">
                  {track.type === 'video' ? (
                    <Film className="w-3.5 h-3.5 text-indigo-accent shrink-0" />
                  ) : (
                    <Music className="w-3.5 h-3.5 text-teal-accent shrink-0" />
                  )}
                  <span className="truncate">{track.name}</span>
                </div>

                {/* Track Controls M/S/L */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => toggleTrackState(track.id, 'muted')}
                    className={`w-5 h-5 rounded text-[10px] font-bold transition-all ${
                      track.muted ? 'bg-red-600 text-white' : 'bg-dark-950 text-neutral-500 hover:text-neutral-300 border border-subtle'
                    }`}
                    title="Mute Track"
                  >
                    M
                  </button>
                  <button
                    onClick={() => toggleTrackState(track.id, 'solo')}
                    className={`w-5 h-5 rounded text-[10px] font-bold transition-all ${
                      track.solo ? 'bg-amber-500 text-black' : 'bg-dark-950 text-neutral-500 hover:text-neutral-300 border border-subtle'
                    }`}
                    title="Solo Track"
                  >
                    S
                  </button>
                  <button
                    onClick={() => toggleTrackState(track.id, 'locked')}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                      track.locked ? 'bg-indigo-accent text-white' : 'bg-dark-950 text-neutral-500 hover:text-neutral-300 border border-subtle'
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
          className="flex-1 bg-dark-950 overflow-x-auto relative divide-y divide-subtle"
          onClick={handleTimelineClick}
        >
          {/* Timecode Ruler Bar */}
          <div className="h-6 bg-dark-900/90 border-b border-subtle sticky top-0 flex items-center font-mono tabular-nums text-[10px] text-neutral-500 z-10 backdrop-blur">
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
              className="relative w-full border-b border-neutral-900/60"
              onDragOver={(e) => {
                e.preventDefault(); // Allow dropping
              }}
              onDrop={(e) => {
                e.preventDefault();
                const assetId = e.dataTransfer.getData("text/plain");
                if (!assetId) return;

                const { assets } = useMediaPoolStore.getState();
                const asset = assets.find(a => a.id === assetId);
                if (!asset) return;

                // Only allow dropping on matching track type
                if (asset.type !== track.type) return;

                const rect = e.currentTarget.getBoundingClientRect();
                const clientX = e.clientX ?? 0;
                const rectLeft = rect.left ?? 0;
                const dropX = clientX - rectLeft;
                const dropTimeSeconds = Math.max(0, dropX / zoomLevel);

                const durationParts = asset.duration.split(':').map(Number);
                const durationSeconds = (durationParts[0] || 0) * 3600 + (durationParts[1] || 0) * 60 + (durationParts[2] || 0);
                const clipDuration = secondsToRational(durationSeconds > 0 ? durationSeconds : 5);

                const newClip: Clip = {
                  id: `clip_${Date.now()}`,
                  assetId: asset.id,
                  name: asset.name,
                  startOffset: secondsToRational(dropTimeSeconds),
                  sourceIn: secondsToRational(0),
                  sourceOut: clipDuration,
                  duration: clipDuration,
                };

                // Using the store's action
                useTimelineStore.getState().addClipToTrack(track.id, newClip);
              }}
            >
              {track.clips.map((clip) => {
                const isSelected = selectedClipIds.includes(clip.id);
                return (
                  <div
                    key={clip.id}
                    onClick={(e) => handleClipClick(e, clip.id)}
                    onPointerDown={(e) => {
                      if (activeTool === 'slip') {
                        handlePointerDown(e, clip.id, 'slip');
                      } else if (activeTool === 'slide') {
                        handlePointerDown(e, clip.id, 'slide');
                      } else if (activeTool === 'select') {
                        handlePointerDown(e, clip.id, 'move');
                      }
                    }}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (activeTool !== 'select') return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickXInClip = e.clientX - rect.left;
                      const timeOffsetInClip = secondsToRational(clickXInClip / zoomLevel);
                      const absoluteTime = addRational(clip.startOffset, timeOffsetInClip);

                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        clipId: clip.id,
                        timeOffset: absoluteTime
                      });
                    }}
                    style={{
                      left: `${rationalToSeconds(clip.startOffset) * zoomLevel}px`,
                      width: `${rationalToSeconds(clip.duration) * zoomLevel}px`,
                      cursor: activeTool === 'blade' ? 'crosshair' : activeTool === 'slip' ? 'ew-resize' : activeTool === 'slide' ? 'move' : 'pointer'
                    }}
                    className={`absolute top-1 bottom-1 rounded-panel px-2.5 flex items-center justify-between text-[11px] font-semibold truncate transition-all shadow-md group relative overflow-hidden ${clip.muted ? 'opacity-50 grayscale' : ''} ${
                      track.type === 'video'
                        ? isSelected
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white ring-2 ring-indigo-400 shadow-indigo-500/30'
                          : 'bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-100 border border-indigo-500/40'
                        : isSelected
                        ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white ring-2 ring-teal-400 shadow-teal-500/30'
                        : 'bg-teal-950/80 hover:bg-teal-900/90 text-teal-100 border border-teal-500/40'
                    }`}
                  >
                    {/* Visual Media Background Elements */}
                    {track.type === 'video' ? (
                      <FilmstripPreview />
                    ) : (
                      <AudioWaveform color={isSelected ? 'bg-white' : 'bg-teal-400'} />
                    )}

                    {/* Clip Edge Drag Handles (Hover / Glow Separators) */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/10 hover:bg-white/30 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-l z-20"
                      onPointerDown={(e) => handlePointerDown(e, clip.id, 'trimIn')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <GripVertical className="w-2.5 h-2.5 text-white/80" />
                    </div>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/10 hover:bg-white/30 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-r z-20"
                      onPointerDown={(e) => handlePointerDown(e, clip.id, 'trimOut')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <GripVertical className="w-2.5 h-2.5 text-white/80" />
                    </div>

                    {/* Content Header */}
                    <div className="flex items-center space-x-1.5 truncate relative z-10">
                      {track.type === 'audio' ? (
                        <Activity className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                      ) : (
                        <Film className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                      )}
                      <span className="truncate drop-shadow">{clip.name}</span>
                    </div>

                    <span className="text-[9px] opacity-90 font-mono tabular-nums ml-2 shrink-0 bg-dark-950/70 px-1.5 py-0.5 rounded border border-white/10 relative z-10 backdrop-blur-sm">
                      {rationalToSeconds(clip.duration).toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Animated Scrubbing Playhead Line, Glow Trail & Badge */}
          <div
            style={{ left: `${rationalToSeconds(playheadPosition) * zoomLevel}px` }}
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none transition-all duration-75 ease-out shadow-[0_0_12px_2px_rgba(239,68,68,0.5)]"
          >
            {/* Playhead Glow Trail */}
            <div className="absolute top-0 bottom-0 -left-3 w-3 bg-gradient-to-r from-transparent to-red-500/20 opacity-80" />

            {/* Playhead Head Marker */}
            <div className="w-3.5 h-3.5 bg-red-500 -ml-1.5 rotate-45 transform -translate-y-1 shadow-lg shadow-red-500/50 border border-white/40" />

            {/* Timecode Badge */}
            <div className="absolute top-0 left-2.5 bg-red-600 text-white text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded shadow-lg shadow-red-600/30 font-bold border border-red-400/30 whitespace-nowrap">
              {rationalToSeconds(playheadPosition).toFixed(2)}s
            </div>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-dark-900 border border-subtle shadow-2xl rounded-md py-1 z-[100] w-48 text-neutral-300 text-[11px] font-medium"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-neutral-800 flex items-center space-x-2 transition-colors"
            onClick={() => {
              splitClip(contextMenu.clipId, contextMenu.timeOffset);
              setContextMenu(null);
            }}
          >
            <SplitSquareHorizontal className="w-3.5 h-3.5" />
            <span>Split at Cursor</span>
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-neutral-800 flex items-center space-x-2 transition-colors"
            onClick={() => {
              toggleClipMute(contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>Mute / Unmute</span>
          </button>
          <div className="h-px bg-neutral-800 my-1 w-full" />
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-red-900/50 hover:text-red-300 text-red-400 flex items-center space-x-2 transition-colors"
            onClick={() => {
              removeClip(contextMenu.clipId);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Clip</span>
          </button>
        </div>
      )}
    </div>
  );
};