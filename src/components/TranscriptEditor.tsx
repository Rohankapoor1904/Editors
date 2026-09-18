import React, { useEffect, useState } from 'react';
import { whisperService, WordTimestamp } from '../services/whisperTranscriber';
import { useTimelineStore } from '../store/timelineStore';
import { rationalToSeconds, secondsToRational } from '../types/time';
import { FileText, Trash2, Play } from 'lucide-react';
import { deleteWordsFromTimeline } from '../services/alignment';

export const TranscriptEditor: React.FC = () => {
  const [words, setWords] = useState<WordTimestamp[]>([]);
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([]);
  const { playheadPosition, setPlayheadPosition, rippleDelete } = useTimelineStore();

  useEffect(() => {
    whisperService.transcribeAudio('/demo/audio.wav').then((res) => {
      setWords(res.words);
    });
  }, []);

  const handleWordClick = (word: WordTimestamp, e: React.MouseEvent) => {
    if (e.shiftKey) {
      setSelectedWordIds((prev) =>
        prev.includes(word.id) ? prev.filter((id) => id !== word.id) : [...prev, word.id]
      );
    } else {
      setSelectedWordIds([word.id]);
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
  };

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
      <div className="flex-1 overflow-y-auto font-sans leading-relaxed text-neutral-300 space-x-1">
        {words.map((w) => {
          const isActive = rationalToSeconds(playheadPosition) >= w.startTime && rationalToSeconds(playheadPosition) <= w.endTime;
          const isSelected = selectedWordIds.includes(w.id);

          return (
            <span
              key={w.id}
              onClick={(e) => handleWordClick(w, e)}
              className={`inline-block px-1 py-0.5 rounded cursor-pointer transition-all ${
                isSelected
                  ? 'bg-red-900 text-red-200 font-bold'
                  : isActive
                  ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-300'
                  : 'hover:bg-neutral-800 hover:text-white'
              }`}
              title={`${w.startTime.toFixed(2)}s - ${w.endTime.toFixed(2)}s`}
            >
              {w.word}
            </span>
          );
        })}
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
