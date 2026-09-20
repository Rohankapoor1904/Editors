import React, { useEffect, useState, useMemo } from 'react';
import { whisperService, WordTimestamp } from '../services/whisperTranscriber';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { rationalToSeconds, secondsToRational } from '../types/time';
import { FileText, Trash2, Play, AlertCircle, Loader2 } from 'lucide-react';
import { deleteWordsFromTimeline } from '../services/alignment';

export const TranscriptEditor: React.FC = () => {
  const [words, setWords] = useState<WordTimestamp[]>([]);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { playheadPosition, setPlayheadPosition, rippleDelete, selectedClipIds, tracks } = useTimelineStore();
  const { assets } = useMediaPoolStore();

  const activeAssetPath = useMemo(() => {
    if (selectedClipIds.length === 0) return null;
    const clipId = selectedClipIds[0];

    // Find the clip in the tracks
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        const asset = assets.find(a => a.id === clip.assetId);
        return asset?.path || null;
      }
    }
    return null;
  }, [selectedClipIds, tracks, assets]);

  useEffect(() => {
    if (!activeAssetPath) {
      setWords([]);
      setError(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    whisperService.transcribeAudio(activeAssetPath)
      .then((res) => {
        if (isMounted) {
          setWords(res.words);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Transcription failed", err);
          setError(err.message || 'Failed to transcribe audio');
          setIsLoading(false);
          setWords([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeAssetPath]);

  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  const handleWordClick = (word: WordTimestamp, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const rangeIds = words.slice(start, end + 1).map(w => w.id);
      setSelectedWordIds(rangeIds);
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedWordIds((prev) =>
        prev.includes(word.id) ? prev.filter((id) => id !== word.id) : [...prev, word.id]
      );
      setLastClickedIndex(index);
    } else {
      setSelectedWordIds([word.id]);
      setLastClickedIndex(index);
      setPlayheadPosition(secondsToRational(word.startTime));
    }
  };

  const handleDeleteSelected = () => {
    const selectedWords = words.filter((w) => selectedWordIds.includes(w.id));
    if (selectedWords.length === 0) return;

    // Execute automated ripple delete on timeline EDL using alignment service
    // and update local word timestamps to reflect the shifted timeline
    const updatedWords = deleteWordsFromTimeline({ rippleDelete }, selectedWords, words);

    // Remove deleted words from transcript view and update timestamps
    setWords(updatedWords);
    setSelectedWordIds([]);
    setLastClickedIndex(null);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedWordIds.length > 0) {
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
        e.preventDefault();
        handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWordIds, words]);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex flex-col h-full select-none text-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2 mb-3">
        <div className="flex items-center space-x-2 font-semibold text-neutral-200">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span>Text-Based Script Editor</span>
        </div>
        {selectedWordIds.length > 0 && (
          <button
            onClick={handleDeleteSelected}
            className="flex items-center space-x-1 px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Selection ({selectedWordIds.length})</span>
          </button>
        )}
      </div>

      {/* Word-Level Interactive Transcript */}
      <div className="flex-1 overflow-y-auto font-sans leading-relaxed text-neutral-300 space-x-1 relative">
        {!activeAssetPath ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 space-y-2">
            <FileText className="w-8 h-8 opacity-50" />
            <p>Select a clip in the timeline to transcribe</p>
          </div>
        ) : isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 space-y-2">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <p>Transcribing audio...</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400/80 space-y-2 text-center p-4">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="font-semibold text-red-400">Transcription Failed</p>
            <p className="text-[10px] opacity-80">{error}</p>
          </div>
        ) : words.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
            <p>No speech detected.</p>
          </div>
        ) : (
          words.map((w, index) => {
            const isActive = rationalToSeconds(playheadPosition) >= w.startTime && rationalToSeconds(playheadPosition) <= w.endTime;
            const isSelected = selectedWordIds.includes(w.id);
            const prevWord = index > 0 ? words[index - 1] : null;
            const pauseBefore = prevWord ? w.startTime - prevWord.endTime : 0;

            return (
              <React.Fragment key={w.id}>
                {pauseBefore >= 0.4 && (
                  <span
                    onClick={() => {
                      rippleDelete(secondsToRational(prevWord!.endTime), secondsToRational(pauseBefore));
                      const updated = words.map(item => item.startTime >= w.startTime ? {
                        ...item,
                        startTime: item.startTime - pauseBefore,
                        endTime: item.endTime - pauseBefore
                      } : item);
                      setWords(updated);
                    }}
                    className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-600/40 hover:bg-red-900 hover:text-white cursor-pointer transition-colors shadow-sm"
                    title={`Pause ${pauseBefore.toFixed(2)}s: Click to ripple delete silence`}
                  >
                    [{pauseBefore.toFixed(1)}s]
                  </span>
                )}
                <span
                  onClick={(e) => handleWordClick(w, index, e)}
                  className={`inline-block px-1 py-0.5 rounded cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-red-900 text-red-200 font-bold'
                      : isActive
                      ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300'
                      : 'hover:bg-neutral-800 hover:text-white'
                  }`}
                  title={`${w.startTime.toFixed(2)}s - ${w.endTime.toFixed(2)}s (Shift-click to select range)`}
                >
                  {w.word}
                </span>
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-neutral-800 pt-2 mt-2 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
        <span>Words: {words.length}</span>
        <span className="flex items-center">
          <Play className="w-3 h-3 mr-1 text-indigo-400" /> Click word to scrub playhead
        </span>
      </div>
    </div>
  );
};
