import React, { useState, useEffect } from 'react';
import { Clip } from '../types/timeline';
import { useMediaPoolStore } from '../store/mediaPool';
import { useTimelineStore } from '../store/timelineStore';
import { SileroVadService, SilenceSegment } from '../services/sileroVad';
import { secondsToRational, addRational, subRational, compareRational } from '../types/time';
import { CompoundCommand } from '../core/commands/transaction';
import { RippleDeleteCommand } from '../core/commands/edits';
import { Scissors, X, Loader2, Play } from 'lucide-react';

interface SilenceTrimmerModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: Clip | null;
}

export const SilenceTrimmerModal: React.FC<SilenceTrimmerModalProps> = ({
  isOpen,
  onClose,
  clip
}) => {
  const [minDuration, setMinDuration] = useState<number>(0.5);
  const [thresholdDb, setThresholdDb] = useState<number>(-35);
  const [silences, setSilences] = useState<SilenceSegment[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assets = useMediaPoolStore(s => s.assets);
  const executeCommand = useTimelineStore(s => s.executeCommand);

  // We need to re-scan whenever minDuration/thresholdDb change, but only if a clip is present
  useEffect(() => {
    if (!isOpen || !clip) {
      setSilences([]);
      setError(null);
      return;
    }

    const asset = assets.find(a => a.id === clip.assetId);
    if (!asset) {
      setError("Source media not found.");
      return;
    }

    let isMounted = true;
    const vad = new SileroVadService();

    const scan = async () => {
      setIsScanning(true);
      setError(null);
      try {
        const results = await vad.detectSilence(asset.path, minDuration, thresholdDb);
        if (isMounted) {
          setSilences(results);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('VAD Error:', err);
          setError(err.message || "Failed to detect silence.");
        }
      } finally {
        if (isMounted) {
          setIsScanning(false);
        }
      }
    };

    scan();

    return () => { isMounted = false; };
  }, [isOpen, clip, assets, minDuration, thresholdDb]);

  if (!isOpen) return null;

  const handleTrim = () => {
    if (!clip || silences.length === 0) return;

    // Filter silences that fall within the clip's source bounds
    // and translate them to timeline coordinates.
    // Apply in reverse temporal order.

    const validCommands: RippleDeleteCommand[] = [];

    const sortedSilences = [...silences].sort((a, b) => b.startTime - a.startTime);

    for (const segment of sortedSilences) {
      const segSourceStart = secondsToRational(segment.startTime);
      const segSourceEnd = addRational(segSourceStart, secondsToRational(segment.duration));

      // Check bounds: segSourceEnd <= clip.sourceIn OR segSourceStart >= clip.sourceOut
      if (compareRational(segSourceEnd, clip.sourceIn) <= 0) continue;
      if (compareRational(segSourceStart, clip.sourceOut) >= 0) continue;

      // Clamp to clip bounds
      const clampedStart = compareRational(segSourceStart, clip.sourceIn) < 0 ? clip.sourceIn : segSourceStart;
      const clampedEnd = compareRational(segSourceEnd, clip.sourceOut) > 0 ? clip.sourceOut : segSourceEnd;

      const duration = subRational(clampedEnd, clampedStart);

      if (duration.value <= 0) continue;

      // Translate to timeline coordinates:
      // timelineStart = clampedStart - clip.sourceIn + clip.startOffset
      const timelineStart = addRational(subRational(clampedStart, clip.sourceIn), clip.startOffset);

      validCommands.push(new RippleDeleteCommand(timelineStart, duration));
    }

    if (validCommands.length > 0) {
      const compoundCmd = new CompoundCommand(validCommands);
      executeCommand(compoundCmd);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-subtle rounded-panel shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-subtle bg-dark-950">
          <div className="flex items-center space-x-2">
            <Scissors className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-neutral-100">1-Click Silence Trimmer</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-5">
          {!clip ? (
            <div className="text-center py-6 text-sm text-neutral-400">
              No clip selected. Please select a clip on the timeline first.
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-neutral-300">Min Silence Duration</label>
                    <span className="text-xs font-mono text-amber-400">{minDuration.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={minDuration}
                    onChange={(e) => setMinDuration(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-medium text-neutral-300">Volume Threshold</label>
                    <span className="text-xs font-mono text-amber-400">{thresholdDb} dB</span>
                  </div>
                  <input
                    type="range"
                    min="-60"
                    max="-10"
                    step="1"
                    value={thresholdDb}
                    onChange={(e) => setThresholdDb(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>
              </div>

              {/* Status & Preview */}
              <div className="bg-dark-950 rounded-md p-3 border border-subtle min-h-[100px] flex flex-col">
                <h3 className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  Detected Gaps
                </h3>

                {isScanning ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-neutral-500 space-y-2">
                    <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                    <span className="text-xs">Analyzing audio...</span>
                  </div>
                ) : error ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-red-400 text-center px-4">
                    {error}
                  </div>
                ) : silences.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-neutral-500">
                    No silence found matching criteria.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                    {silences.map((seg, i) => (
                      <div
                        key={i}
                        className="flex items-center space-x-1.5 bg-neutral-900 border border-neutral-700/50 rounded-full px-2 py-1 select-none"
                      >
                        <Play className="w-3 h-3 text-amber-400/70" />
                        <span className="text-[10px] font-mono text-neutral-300">
                          {seg.startTime.toFixed(2)}s
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          ({seg.duration.toFixed(2)}s)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-subtle bg-dark-950 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTrim}
            disabled={!clip || silences.length === 0 || isScanning}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm shadow-amber-900/20"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Trim {silences.length > 0 ? silences.length : ''} Gaps</span>
          </button>
        </div>
      </div>
    </div>
  );
};
