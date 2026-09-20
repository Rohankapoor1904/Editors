import React, { useState, useEffect } from 'react';
import { useMediaPoolStore } from '../store/mediaPool';
import { useTimelineStore } from '../store/timelineStore';
import { RationalTime, secondsToRational, compareRational, subRational, rationalToSeconds } from '../types/time';
import { Clip } from '../types/timeline';
import { ChevronLeft, ChevronRight, ArrowDownToLine, FileSymlink, Crosshair } from 'lucide-react';

export const SourceMonitor: React.FC = () => {
  const { assets, selectedAssetId } = useMediaPoolStore();
  const { tracks, targetTrackId, setTargetTrack, insertClip, overwriteClip } = useTimelineStore();
  
  const [inPoint, setInPoint] = useState<RationalTime | null>(null);
  const [outPoint, setOutPoint] = useState<RationalTime | null>(null);
  const [sourcePlayhead, setSourcePlayhead] = useState<RationalTime>(secondsToRational(0));

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  const parseAssetDuration = (durationStr: string): RationalTime => {
    const parts = durationStr.split(':').map(Number);
    const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return secondsToRational(secs > 0 ? secs : 5);
  };

  const fullDuration = selectedAsset ? parseAssetDuration(selectedAsset.duration) : secondsToRational(5);
  const fullDurationSec = Math.max(0.1, rationalToSeconds(fullDuration));
  const currentSec = Math.max(0, Math.min(fullDurationSec, rationalToSeconds(sourcePlayhead)));

  // Target track resolution: if explicitly set and matches type, use it; otherwise first unlocked matching track
  const matchingTracks = tracks.filter(t => selectedAsset && t.type === selectedAsset.type && !t.locked);
  const targetTrack = (targetTrackId ? tracks.find(t => t.id === targetTrackId && t.type === selectedAsset?.type && !t.locked) : undefined)
    || matchingTracks[0];

  const handleMarkIn = () => {
    if (!selectedAsset) return;
    setInPoint(sourcePlayhead);
  };

  const handleMarkOut = () => {
    if (!selectedAsset) return;
    setOutPoint(sourcePlayhead);
  };

  const createClipFromSelection = (): Clip | null => {
    if (!selectedAsset) return null;

    let start = inPoint || secondsToRational(0);
    let end = outPoint || fullDuration;

    // Ensure valid bounds
    if (compareRational(start, end) > 0) {
      const temp = start;
      start = end;
      end = temp;
    }
    
    if (compareRational(end, fullDuration) > 0) {
      end = fullDuration;
    }

    const duration = subRational(end, start);

    return {
      id: `clip_${Date.now()}`,
      assetId: selectedAsset.id,
      name: selectedAsset.name,
      startOffset: secondsToRational(0),
      sourceIn: start,
      sourceOut: end,
      duration
    };
  };

  const handleInsert = () => {
    if (!selectedAsset || !targetTrack) return;
    const clip = createClipFromSelection();
    if (!clip) return;

    const { playheadPosition } = useTimelineStore.getState();
    clip.startOffset = playheadPosition;
    insertClip(targetTrack.id, clip);
  };

  const handleOverwrite = () => {
    if (!selectedAsset || !targetTrack) return;
    const clip = createClipFromSelection();
    if (!clip) return;

    const { playheadPosition } = useTimelineStore.getState();
    clip.startOffset = playheadPosition;
    overwriteClip(targetTrack.id, clip);
  };

  // Keyboard shortcut listener integration
  useEffect(() => {
    const onInsert = () => handleInsert();
    const onOverwrite = () => handleOverwrite();
    const onMarkIn = () => handleMarkIn();
    const onMarkOut = () => handleMarkOut();

    window.addEventListener('timeline-insert-edit', onInsert);
    window.addEventListener('timeline-overwrite-edit', onOverwrite);
    window.addEventListener('timeline-mark-in', onMarkIn);
    window.addEventListener('timeline-mark-out', onMarkOut);

    return () => {
      window.removeEventListener('timeline-insert-edit', onInsert);
      window.removeEventListener('timeline-overwrite-edit', onOverwrite);
      window.removeEventListener('timeline-mark-in', onMarkIn);
      window.removeEventListener('timeline-mark-out', onMarkOut);
    };
  }, [selectedAsset, targetTrack, inPoint, outPoint, sourcePlayhead]);

  // Reset In/Out points and playhead when selected asset changes
  useEffect(() => {
    setInPoint(null);
    setOutPoint(null);
    setSourcePlayhead(secondsToRational(0));
  }, [selectedAssetId]);

  if (!selectedAsset) {
    return (
      <div className="flex-1 h-full w-full max-h-full bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative overflow-hidden min-h-0">
        <div className="flex-1 w-full flex items-center justify-center relative min-h-0 py-1">
          <div className="w-full h-full bg-neutral-900 border border-neutral-800/90 rounded-xl shadow-2xl flex items-center justify-center relative overflow-hidden">
             <span className="text-neutral-500 text-sm">No Asset Selected</span>
          </div>
        </div>
      </div>
    );
  }

  const formatTimecode = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    const ms = Math.floor((sec % 1) * 100).toString().padStart(2, '0');
    return `${m}:${s}.${ms}`;
  };

  return (
    <div className="flex-1 h-full w-full max-h-full bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative overflow-hidden min-h-0">
      <div className="w-full flex items-center justify-between mb-1.5 px-2 text-[11px] text-neutral-400 shrink-0 gap-2">
         <span className="font-semibold text-neutral-200 truncate max-w-[200px]">{selectedAsset.name}</span>
         <span className="text-[10px] text-neutral-500 font-mono">Source Monitor</span>
      </div>

      <div className="flex-1 w-full flex items-center justify-center relative min-h-0 py-1">
        <div className="w-full h-full bg-neutral-900 border border-neutral-800/90 rounded-xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden aspect-[16/9]">
           {/* Raw Video Canvas */}
           <div className="flex flex-col items-center space-y-2">
             <span className="text-neutral-600 font-mono text-sm">[Raw Video Canvas]</span>
             <span className="text-xs text-neutral-500 font-mono">{formatTimecode(currentSec)}</span>
           </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full flex flex-col space-y-2 mt-2 bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800">
        {/* Scrubber & In/Out Range Bar */}
        <div className="w-full flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono">
            <span>{formatTimecode(currentSec)}</span>
            {inPoint && outPoint && (
              <span className="text-indigo-400 font-semibold">
                In-Out: {formatTimecode(Math.abs(rationalToSeconds(outPoint) - rationalToSeconds(inPoint)))}
              </span>
            )}
            <span>{formatTimecode(fullDurationSec)}</span>
          </div>
          <div
            data-testid="source-scrubber"
            className="relative w-full h-3 bg-neutral-800/90 hover:bg-neutral-800 rounded cursor-pointer overflow-hidden border border-neutral-700/50"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setSourcePlayhead(secondsToRational(ratio * fullDurationSec));
            }}
          >
            {/* Highlighted In/Out range */}
            {inPoint && outPoint && (
              <div
                className="absolute top-0 bottom-0 bg-indigo-500/40 border-l-2 border-r-2 border-indigo-400"
                style={{
                  left: `${(rationalToSeconds(inPoint) / fullDurationSec) * 100}%`,
                  width: `${Math.max(2, (Math.abs(rationalToSeconds(outPoint) - rationalToSeconds(inPoint)) / fullDurationSec) * 100)}%`
                }}
              />
            )}
            {/* Playhead thumb */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow"
              style={{ left: `${(currentSec / fullDurationSec) * 100}%` }}
            />
          </div>
        </div>

        {/* Action Controls & Target Track Bar */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
             <button
               title="Mark In [I]"
               onClick={handleMarkIn}
               className={`p-1.5 rounded transition-colors ${
                 inPoint ? 'bg-indigo-600/30 text-indigo-300' : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
               }`}
             >
               <ChevronLeft className="w-4 h-4" />
             </button>
             <button
               title="Mark Out [O]"
               onClick={handleMarkOut}
               className={`p-1.5 rounded transition-colors ${
                 outPoint ? 'bg-indigo-600/30 text-indigo-300' : 'hover:bg-neutral-800 text-neutral-400 hover:text-white'
               }`}
             >
               <ChevronRight className="w-4 h-4" />
             </button>

             {/* Target Track Selector */}
             <div className="flex items-center space-x-1.5 ml-2 pl-2 border-l border-neutral-800">
               <Crosshair className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
               <select
                 title="Target Track"
                 value={targetTrack?.id || ''}
                 onChange={(e) => setTargetTrack(e.target.value || null)}
                 className="bg-neutral-800 text-neutral-200 text-[10px] rounded px-1.5 py-0.5 border border-neutral-700 outline-none focus:border-indigo-500 cursor-pointer"
               >
                 {matchingTracks.map(t => (
                   <option key={t.id} value={t.id}>{t.name}</option>
                 ))}
               </select>
             </div>
          </div>
          
          <div className="flex items-center space-x-2">
             <button
               title="Insert (,)"
               onClick={handleInsert}
               className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 rounded text-indigo-300 hover:text-white transition-colors border border-indigo-500/30 hover:border-indigo-500/60"
             >
               <ArrowDownToLine className="w-3.5 h-3.5" />
               <span className="text-[11px] font-medium">Insert</span>
             </button>
             <button
               title="Overwrite (.)"
               onClick={handleOverwrite}
               className="flex items-center space-x-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700/80 rounded text-neutral-300 hover:text-white transition-colors border border-neutral-700 hover:border-neutral-600"
             >
               <FileSymlink className="w-3.5 h-3.5" />
               <span className="text-[11px] font-medium">Overwrite</span>
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};
