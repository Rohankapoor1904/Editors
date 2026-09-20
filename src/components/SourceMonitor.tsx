import React, { useState } from 'react';
import { useMediaPoolStore } from '../store/mediaPool';
import { useTimelineStore } from '../store/timelineStore';
import { RationalTime, secondsToRational, compareRational, addRational, subRational } from '../types/time';
import { Clip } from '../types/timeline';
import { ChevronLeft, ChevronRight, ArrowDownToLine, FileSymlink } from 'lucide-react';

export const SourceMonitor: React.FC = () => {
  const { assets, selectedAssetId } = useMediaPoolStore();
  const { tracks, addClipToTrack, overwriteClip } = useTimelineStore();
  
  const [inPoint, setInPoint] = useState<RationalTime | null>(null);
  const [outPoint, setOutPoint] = useState<RationalTime | null>(null);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  // Simple mock of current time for placeholder since real playback is unsupported
  const currentTime = secondsToRational(0);

  const handleMarkIn = () => {
    if (!selectedAsset) return;
    setInPoint(currentTime);
  };

  const handleMarkOut = () => {
    if (!selectedAsset) return;
    setOutPoint(currentTime);
  };

  const parseAssetDuration = (durationStr: string): RationalTime => {
    const parts = durationStr.split(':').map(Number);
    const secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return secondsToRational(secs > 0 ? secs : 5);
  };

  const createClipFromSelection = (): Clip | null => {
    if (!selectedAsset) return null;

    const fullDuration = parseAssetDuration(selectedAsset.duration);
    let start = inPoint || secondsToRational(0);
    let end = outPoint || fullDuration;

    // Ensure valid bounds
    if (compareRational(start, end) > 0) {
      // Invert if crossed
      const temp = start;
      start = end;
      end = temp;
    }
    
    // Bounds check against max duration
    if (compareRational(end, fullDuration) > 0) {
      end = fullDuration;
    }

    const duration = subRational(end, start);

    return {
      id: `clip_${Date.now()}`,
      assetId: selectedAsset.id,
      name: selectedAsset.name,
      startOffset: secondsToRational(0), // Will be set by insertion logic
      sourceIn: start,
      sourceOut: end,
      duration
    };
  };

  const handleInsert = () => {
    if (!selectedAsset) return;
    const targetTrack = tracks.find(t => t.type === selectedAsset.type);
    if (!targetTrack) return;
    
    const clip = createClipFromSelection();
    if (!clip) return;

    let maxEnd = secondsToRational(0);
    for (const c of targetTrack.clips) {
       const clipEnd = addRational(c.startOffset, c.duration);
       if (compareRational(clipEnd, maxEnd) > 0) {
         maxEnd = clipEnd;
       }
    }
    clip.startOffset = maxEnd;
    addClipToTrack(targetTrack.id, clip);
  };

  const handleOverwrite = () => {
    if (!selectedAsset) return;
    const targetTrack = tracks.find(t => t.type === selectedAsset.type);
    if (!targetTrack) return;
    
    const clip = createClipFromSelection();
    if (!clip) return;

    const { playheadPosition } = useTimelineStore.getState();
    clip.startOffset = playheadPosition;
    overwriteClip(targetTrack.id, clip);
  };

  if (!selectedAsset) {
    return (
      <div className="flex-1 bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center relative min-h-0 py-1">
          <div className="w-full h-full bg-neutral-900 border border-neutral-800/90 rounded-xl shadow-2xl flex items-center justify-center relative overflow-hidden">
             <span className="text-neutral-500 text-sm">No Asset Selected</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-neutral-950 flex flex-col justify-between items-center p-3 select-none relative overflow-hidden">
      <div className="w-full flex items-center justify-between mb-1.5 px-2 text-[11px] text-neutral-400 shrink-0 gap-2">
         <span className="font-semibold text-neutral-200 truncate max-w-[200px]">{selectedAsset.name}</span>
         <span className="text-[10px] text-neutral-500 font-mono">Source Monitor</span>
      </div>

      <div className="flex-1 w-full flex items-center justify-center relative min-h-0 py-1">
        <div className="w-full h-full bg-neutral-900 border border-neutral-800/90 rounded-xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden aspect-[16/9]">
           {/* Placeholder for actual video rendering */}
           <div className="flex flex-col items-center space-y-2">
             <span className="text-neutral-600 font-mono text-sm">[Raw Video Canvas]</span>
           </div>
        </div>
      </div>

      {/* Controls */}
      <div className="w-full flex flex-col space-y-1.5 mt-2 bg-neutral-900/40 p-2 rounded-lg border border-neutral-800">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center space-x-2">
             <button
               title="Mark In [I]"
               onClick={handleMarkIn}
               className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
             >
               <ChevronLeft className="w-4 h-4" />
             </button>
             <button
               title="Mark Out [O]"
               onClick={handleMarkOut}
               className="p-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors"
             >
               <ChevronRight className="w-4 h-4" />
             </button>
          </div>
          
          <div className="flex items-center space-x-2">
             <button
               title="Insert (,)"
               onClick={handleInsert}
               className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors border border-neutral-800 hover:border-neutral-700"
             >
               <ArrowDownToLine className="w-3.5 h-3.5" />
               <span className="text-[11px] font-medium">Insert</span>
             </button>
             <button
               title="Overwrite (.)"
               onClick={handleOverwrite}
               className="flex items-center space-x-1.5 px-3 py-1.5 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white transition-colors border border-neutral-800 hover:border-neutral-700"
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
