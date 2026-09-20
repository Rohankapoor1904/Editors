import React, { useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { Clip } from '../types/timeline';
import { rationalToSeconds, secondsToRational, addRational } from '../types/time';
import { Scissors, ZoomIn, ZoomOut, Lock, MousePointer, MoveHorizontal, ArrowLeftRight, Film, Music, Activity, GripVertical, ChevronDown, ListPlus, Trash2, SplitSquareHorizontal, VolumeX, RotateCw, Zap, Link2 } from 'lucide-react';

export type EditingTool = 'select' | 'blade' | 'slip' | 'slide';

import { getOrCreateWaveformEnvelope, renderWaveformToCanvas } from '../utils/waveform';
import { CurveEditor } from './CurveEditor';
import { createSpeedRampTemplate } from '../engine/speedRamp';
import { beatDetector } from '../engine/beatDetector';
import { calculateMagneticSnap } from '../utils/snapping';

// Dynamic Audio Waveform Canvas Component
const AudioWaveformCanvas: React.FC<{
  assetId: string;
  sourceInSeconds: number;
  durationSeconds: number;
  volumeDb?: number;
  color?: string;
}> = ({ assetId, sourceInSeconds, durationSeconds, volumeDb = 0, color = '#2dd4bf' }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth || 100;
    const height = canvas.clientHeight || 40;
    if (width === 0 || height === 0) return;

    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);

    const envelope = getOrCreateWaveformEnvelope(assetId, Math.max(durationSeconds + sourceInSeconds, 10));
    renderWaveformToCanvas(ctx, envelope, width, height, sourceInSeconds, durationSeconds, color, volumeDb);
  }, [assetId, sourceInSeconds, durationSeconds, volumeDb, color]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none opacity-85"
    />
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

export interface TimelineTrackEditorProps {
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const TimelineTrackEditor: React.FC<TimelineTrackEditorProps> = ({ height, className = '', style }) => {
  const [activeTool, setActiveTool] = useState<EditingTool>('select');
  const [showAddTrackMenu, setShowAddTrackMenu] = useState(false);
  const [showCurveEditor, setShowCurveEditor] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    clipId: string;
    timeOffset: import('../types/time').RationalTime;
  } | null>(null);

  React.useEffect(() => {
    const handleSetActiveTool = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveTool(customEvent.detail as EditingTool);
      }
    };
    window.addEventListener('set-active-tool', handleSetActiveTool);
    return () => window.removeEventListener('set-active-tool', handleSetActiveTool);
  }, []);

  const {
    tracks,
    playheadPosition,
    zoomLevel,
    selectedClipIds,
    targetTrackId,
    magneticSnapping,
    setPlayheadPosition,
    setTargetTrack,
    setZoomLevel,
    toggleMagneticSnapping,
    toggleTrackState,
    addTrack,
    selectClip,
    splitClip,
    trimClip,
    splitTrimClip,
    slipClip,
    slideClip,
    moveClip,
    removeClip,
    toggleClipMute,
    applySpeedRamp,
    realignSync
  } = useTimelineStore();

  const [snapToBeat, setSnapToBeat] = useState(true);

  // Extract active musical beat markers from audio clips
  const audioBeatMarkers = React.useMemo(() => {
    const beats: number[] = [];
    const audioClips = tracks.filter((t) => t.type === 'audio').flatMap((t) => t.clips);
    for (const clip of audioClips) {
      const clipStart = rationalToSeconds(clip.startOffset);
      const clipDur = rationalToSeconds(clip.duration);
      const beatData = beatDetector.getOrComputeAssetBeats(clip.assetId, clipDur);
      for (const b of beatData.beats) {
        beats.push(Number((clipStart + b).toFixed(3)));
      }
    }
    return beats;
  }, [tracks]);

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
    isSplitTrim?: boolean;
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
      isSplitTrim: e.altKey, // Holding Alt enables independent J-Cut / L-Cut split trimming
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
      let delta = secondsToRational(deltaSeconds);

      try {
        if (dragState.type === 'trimIn') {
          if (magneticSnapping) {
            const clip = tracks.flatMap((t) => t.clips).find((c) => c.id === dragState.clipId);
            if (clip) {
              const currentStartSec = rationalToSeconds(clip.startOffset);
              const targetSec = currentStartSec + deltaSeconds;
              const otherClips = tracks.flatMap((t) => t.clips).filter((c) => c.id !== dragState.clipId);
              const snap = calculateMagneticSnap(
                targetSec,
                otherClips,
                rationalToSeconds(playheadPosition),
                zoomLevel,
                12,
                snapToBeat ? audioBeatMarkers : []
              );
              if (snap.isSnapped) {
                delta = secondsToRational(snap.snappedTime - currentStartSec);
              }
            }
          }
          if (dragState.isSplitTrim) {
            splitTrimClip(dragState.clipId, 'in', delta);
          } else {
            trimClip(dragState.clipId, 'in', delta);
          }
        } else if (dragState.type === 'trimOut') {
          if (magneticSnapping) {
            const clip = tracks.flatMap((t) => t.clips).find((c) => c.id === dragState.clipId);
            if (clip) {
              const currentEndSec = rationalToSeconds(addRational(clip.startOffset, clip.duration));
              const targetSec = currentEndSec + deltaSeconds;
              const otherClips = tracks.flatMap((t) => t.clips).filter((c) => c.id !== dragState.clipId);
              const snap = calculateMagneticSnap(
                targetSec,
                otherClips,
                rationalToSeconds(playheadPosition),
                zoomLevel,
                12,
                snapToBeat ? audioBeatMarkers : []
              );
              if (snap.isSnapped) {
                delta = secondsToRational(snap.snappedTime - currentEndSec);
              }
            }
          }
          if (dragState.isSplitTrim) {
            splitTrimClip(dragState.clipId, 'out', delta);
          } else {
            trimClip(dragState.clipId, 'out', delta);
          }
        } else if (dragState.type === 'slip') {
          slipClip(dragState.clipId, delta);
        } else if (dragState.type === 'slide') {
          slideClip(dragState.clipId, delta);
        } else if (dragState.type === 'move' && dragState.startOffset) {
          let targetSeconds = rationalToSeconds(dragState.startOffset) + deltaSeconds;
          if (magneticSnapping) {
            const otherClips = tracks.flatMap((t) => t.clips).filter((c) => c.id !== dragState.clipId);
            const snap = calculateMagneticSnap(
              targetSeconds,
              otherClips,
              rationalToSeconds(playheadPosition),
              zoomLevel,
              12,
              snapToBeat ? audioBeatMarkers : []
            );
            if (snap.isSnapped) {
              targetSeconds = snap.snappedTime;
            }
          }
          const newStartOffset = secondsToRational(Math.max(0, targetSeconds));
          const trackId = tracks.find((t) => t.clips.some((c) => c.id === dragState.clipId))?.id;
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
    <div
      style={{
        height: height ? `${height}px` : undefined,
        minHeight: height ? `${height}px` : undefined,
        maxHeight: height ? `${height}px` : undefined,
        ...style,
      }}
      className={`bg-dark-900 border-t border-subtle flex flex-col select-none text-xs shrink-0 ${!height ? 'h-72' : ''} ${className}`}
    >
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
          {/* Curve Editor Toggle */}
          <button
            onClick={() => setShowCurveEditor(!showCurveEditor)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-panel border transition-all text-[11px] font-medium ${
              showCurveEditor
                ? 'bg-purple-600/30 border-purple-500/60 text-purple-200 shadow-md shadow-purple-900/30 font-semibold'
                : 'bg-dark-900 border-subtle hover:bg-neutral-800/80 text-neutral-300'
            }`}
            title="Toggle Visual Keyframe Bezier Curve Editor"
            data-testid="curve-editor-toggle"
          >
            <Activity className="w-3.5 h-3.5 text-purple-400" />
            <span>Curves</span>
          </button>

          {/* Magnetic Snap Toggle */}
          <button
            onClick={toggleMagneticSnapping}
            className={`flex items-center space-x-1 px-2 py-1 rounded-panel border transition-all text-[11px] font-medium ${
              magneticSnapping
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-sm font-semibold'
                : 'bg-dark-900 border-subtle hover:bg-neutral-800/80 text-neutral-400'
            }`}
            title="Toggle Magnetic Snapping (S)"
            data-testid="magnetic-snap-toggle"
          >
            <Zap className={`w-3 h-3 ${magneticSnapping ? 'text-amber-400' : 'text-neutral-500'}`} />
            <span>Snap</span>
          </button>

          {/* AI Beat / Rhythm Snapping Toggle */}
          <button
            onClick={() => setSnapToBeat(!snapToBeat)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-panel border transition-all text-[11px] font-medium ${
              snapToBeat
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm font-semibold'
                : 'bg-dark-900 border-subtle hover:bg-neutral-800/80 text-neutral-400'
            }`}
            title="Toggle AI Rhythm / Beat Snapping"
            data-testid="beat-snap-toggle"
          >
            <Music className={`w-3 h-3 ${snapToBeat ? 'text-emerald-400' : 'text-neutral-500'}`} />
            <span>Beats</span>
          </button>

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

                {/* Track Controls T/M/S/L */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setTargetTrack(targetTrackId === track.id ? null : track.id)}
                    className={`w-5 h-5 rounded text-[10px] font-bold transition-all ${
                      targetTrackId === track.id ? 'bg-indigo-600 text-white shadow ring-1 ring-indigo-400' : 'bg-dark-950 text-neutral-500 hover:text-neutral-300 border border-subtle'
                    }`}
                    title={targetTrackId === track.id ? "Active Target Track" : "Set as Target Track"}
                    data-testid={`target-track-${track.id}`}
                  >
                    T
                  </button>
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
                    {track.type === 'video' ? (
                      <FilmstripPreview />
                    ) : (
                      <>
                        <AudioWaveformCanvas
                          assetId={clip.assetId}
                          sourceInSeconds={rationalToSeconds(clip.sourceIn)}
                          durationSeconds={rationalToSeconds(clip.duration)}
                          volumeDb={clip.volume ?? 0}
                          color={isSelected ? '#5eead4' : '#2dd4bf'}
                        />
                        {/* Musical Beat Markers */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                          {beatDetector.getOrComputeAssetBeats(clip.assetId, rationalToSeconds(clip.duration)).beats.map((b, i) => (
                            <div
                              key={i}
                              style={{ left: `${b * zoomLevel}px` }}
                              className="absolute top-0 bottom-0 w-px bg-amber-400/40 flex flex-col justify-between items-center"
                              title={`Beat: ${b.toFixed(2)}s`}
                            >
                              <div className="w-1 h-1 bg-amber-300 rounded-full shadow-sm" />
                              <div className="w-1 h-1 bg-amber-300 rounded-full shadow-sm" />
                            </div>
                          ))}
                        </div>
                      </>
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

                    <div className="flex items-center space-x-1 shrink-0 ml-2 relative z-10">
                      {clip.speedRamp?.envelope && clip.speedRamp.envelope.length > 0 ? (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-500/25 text-purple-300 border border-purple-500/40 shadow-sm" title="Speed Ramp Envelope Applied">
                          Ramp
                        </span>
                      ) : clip.speed && clip.speed !== 1.0 ? (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm" title={`Playback Speed ${clip.speed}x`}>
                          {clip.speed}x
                        </span>
                      ) : null}

                      {clip.reverse && (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/40 shadow-sm" title="Reverse Playback">
                          « Rev
                        </span>
                      )}

                      {clip.splitTrimType && clip.splitTrimType !== 'none' && clip.syncOffset && (
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shadow-sm flex items-center space-x-0.5 ${
                            clip.splitTrimType === 'j-cut'
                              ? 'bg-blue-500/25 text-blue-300 border-blue-500/40'
                              : 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                          }`}
                          title={`${clip.splitTrimType.toUpperCase()}: Sync offset ${rationalToSeconds(clip.syncOffset).toFixed(2)}s`}
                          data-testid="sync-offset-badge"
                        >
                          <span>{clip.splitTrimType.toUpperCase()}</span>
                          <span className="opacity-80">({rationalToSeconds(clip.syncOffset) > 0 ? '+' : ''}{rationalToSeconds(clip.syncOffset).toFixed(2)}s)</span>
                        </span>
                      )}

                      <span className="text-[9px] opacity-90 font-mono tabular-nums bg-dark-950/70 px-1.5 py-0.5 rounded border border-white/10 backdrop-blur-sm">
                        {rationalToSeconds(clip.duration).toFixed(1)}s
                      </span>
                    </div>
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

      {/* Collapsible Keyframe Bezier Curve Editor */}
      {showCurveEditor && (
        <CurveEditor
          height={180}
          onClose={() => setShowCurveEditor(false)}
        />
      )}

      {/* Clip Context Menu */}
      {contextMenu && (
        <div
          data-testid="clip-context-menu"
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

          {(() => {
            const clip = tracks.flatMap(t => t.clips).find(c => c.id === contextMenu.clipId);
            if (clip?.linkedClipId || (clip?.splitTrimType && clip.splitTrimType !== 'none')) {
              return (
                <button
                  className="w-full px-3 py-1.5 text-left hover:bg-neutral-800 flex items-center space-x-2 transition-colors text-indigo-300"
                  data-testid="realign-sync-btn"
                  onClick={() => {
                    realignSync(contextMenu.clipId);
                    setContextMenu(null);
                  }}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Re-align A/V Sync</span>
                </button>
              );
            }
            return null;
          })()}

          <div className="h-px bg-neutral-800 my-1 w-full" />
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
            Speed / Ramping
          </div>
          <div className="grid grid-cols-4 gap-1 px-2 py-1">
            {[0.5, 1.0, 2.0, 4.0].map((spd) => (
              <button
                key={spd}
                data-testid={`speed-${spd}x`}
                onClick={() => {
                  applySpeedRamp(contextMenu.clipId, { constantSpeed: spd });
                  setContextMenu(null);
                }}
                className="px-1 py-0.5 bg-neutral-800/80 hover:bg-indigo-600 rounded text-center text-[10px] text-neutral-200 transition-colors font-mono"
              >
                {spd}x
              </button>
            ))}
          </div>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-neutral-800 flex items-center space-x-2 transition-colors text-amber-400"
            data-testid="reverse-playback-btn"
            onClick={() => {
              const clip = tracks.flatMap(t => t.clips).find(c => c.id === contextMenu.clipId);
              if (clip) {
                applySpeedRamp(contextMenu.clipId, {
                  reverse: !clip.reverse,
                  constantSpeed: clip.speed || 1.0
                });
              }
              setContextMenu(null);
            }}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Reverse Playback</span>
          </button>
          <button
            className="w-full px-3 py-1.5 text-left hover:bg-neutral-800 flex items-center space-x-2 transition-colors text-purple-400"
            data-testid="apply-ramp-btn"
            onClick={() => {
              const clip = tracks.flatMap(t => t.clips).find(c => c.id === contextMenu.clipId);
              if (clip) {
                const ramp = createSpeedRampTemplate('slow-mo', clip.duration);
                applySpeedRamp(contextMenu.clipId, { envelope: ramp });
              }
              setContextMenu(null);
            }}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Apply Speed Ramp</span>
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