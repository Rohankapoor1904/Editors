import React, { useState, useMemo } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { rationalToSeconds } from '../types/time';
import {
  buildReviewBundle,
  encodeReviewLink,
  decodeReviewLink,
  checkPublishReady,
  ReviewBundle,
} from '../services/reviewShare';
import { SOCIAL_PRESETS, PublishCompatibilityError } from '../engine/exportPresets';
import { MessageSquare, Plus, X, Check, Link2, Send, AlertTriangle } from 'lucide-react';

/**
 * R26.5 — Review panel: timecoded comments anchored to the playhead, seek on
 * click, resolve/remove, shareable review link, and platform-safe publish check.
 */
export const ReviewPanel: React.FC = () => {
  const {
    comments,
    playheadPosition,
    metadata,
    setPlayheadPosition,
    addComment,
    removeComment,
    resolveComment,
  } = useTimelineStore();
  const assets = useMediaPoolStore((s) => s.assets);

  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('Local');
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState('youtube_4k');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishOk, setPublishOk] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...comments].sort((a, b) => rationalToSeconds(a.time) - rationalToSeconds(b.time)),
    [comments]
  );

  const fmt = (value: number, rate: number): string => {
    const sec = rate > 0 ? value / rate : 0;
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  };

  const handleAdd = () => {
    if (draft.trim().length === 0) return;
    addComment(draft, author);
    setDraft('');
  };

  const handleShare = () => {
    try {
      setLinkError(null);
      const bundle = buildReviewBundle(useTimelineStore.getState(), assets);
      setShareLink(encodeReviewLink(bundle));
    } catch (err) {
      setShareLink(null);
      setLinkError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportLink = (raw: string) => {
    try {
      setLinkError(null);
      const bundle: ReviewBundle = decodeReviewLink(raw.trim());
      // Merge comments that are not already present (by id).
      const existing = new Set(comments.map((c) => c.id));
      for (const p of bundle.comments) {
        if (existing.has(p.id)) continue;
        // Direct store write for import — comments are annotations, not editorial ops.
        useTimelineStore.setState((s) => ({
          comments: [
            ...s.comments,
            {
              id: p.id,
              time: { value: p.time.value, rate: p.time.rate },
              author: p.author,
              body: p.body,
              resolved: p.resolved,
              createdAt: p.createdAt,
            },
          ],
        }));
      }
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePublishCheck = () => {
    setPublishError(null);
    setPublishOk(null);
    try {
      const result = checkPublishReady({
        masterWidth: metadata.width,
        masterHeight: metadata.height,
        presetId,
      });
      setPublishOk(`Ready for ${result.presetName}`);
    } catch (err) {
      if (err instanceof PublishCompatibilityError) {
        setPublishError(`[${err.code}] ${err.message}`);
      } else {
        setPublishError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const openCount = sorted.filter((c) => !c.resolved).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-dark-950 text-xs text-neutral-300">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-subtle px-3 py-2 bg-dark-900/60">
        <div className="flex items-center space-x-1.5">
          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-semibold text-neutral-100">Review</span>
          <span className="px-1.5 py-0.5 rounded-full bg-dark-800 text-[10px] font-mono border border-subtle">
            {openCount} open / {sorted.length}
          </span>
        </div>
        <span className="text-[10px] text-neutral-500 font-mono">
          @ {fmt(playheadPosition.value, playheadPosition.rate)}
        </span>
      </div>

      {/* Composer */}
      <div className="p-3 border-b border-subtle space-y-2">
        <div className="flex space-x-2">
          <input
            aria-label="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-24 bg-dark-950 border border-subtle rounded px-2 py-1 text-[11px]"
            placeholder="Author"
          />
          <input
            aria-label="Comment body"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1 bg-dark-950 border border-subtle rounded px-2 py-1 text-[11px]"
            placeholder="Add a timecoded note at the playhead…"
          />
          <button
            onClick={handleAdd}
            disabled={draft.trim().length === 0}
            className="px-2 py-1 bg-indigo-accent hover:bg-indigo-hover disabled:opacity-40 text-white rounded text-[11px] flex items-center space-x-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sorted.length === 0 && (
          <div className="text-center text-neutral-500 py-6 text-[11px]">
            No review comments yet. Add one at the playhead.
          </div>
        )}
        {sorted.map((c) => (
          <div
            key={c.id}
            className={`border rounded-panel p-2 ${c.resolved ? 'border-subtle bg-dark-900/40 opacity-70' : 'border-indigo-500/30 bg-dark-900'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => setPlayheadPosition({ ...c.time })}
                className="text-left flex-1 min-w-0"
                title="Seek to comment"
              >
                <div className="flex items-center space-x-1.5">
                  <span className="font-mono text-[10px] text-indigo-300">
                    {fmt(c.time.value, c.time.rate)}
                  </span>
                  <span className="text-[10px] text-neutral-400">{c.author}</span>
                  {c.resolved && (
                    <span className="px-1 rounded bg-teal-950 text-teal-300 text-[9px]">resolved</span>
                  )}
                </div>
                <p className={`text-[11px] mt-0.5 ${c.resolved ? 'line-through text-neutral-500' : 'text-neutral-200'}`}>
                  {c.body}
                </p>
              </button>
              <div className="flex items-center space-x-1 shrink-0">
                <button
                  onClick={() => resolveComment(c.id, !c.resolved)}
                  title={c.resolved ? 'Reopen' : 'Resolve'}
                  className="p-1 rounded hover:bg-dark-800 text-neutral-400"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => removeComment(c.id)}
                  title="Delete"
                  className="p-1 rounded hover:bg-dark-800 text-neutral-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Share + publish */}
      <div className="border-t border-subtle p-3 space-y-2 bg-dark-900/50">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleShare}
            className="flex items-center space-x-1 px-2 py-1 bg-dark-800 hover:bg-dark-700 border border-subtle rounded text-[11px]"
          >
            <Link2 className="w-3 h-3" />
            <span>Copy review link</span>
          </button>
          <button
            onClick={() => {
              if (shareLink) navigator.clipboard?.writeText(shareLink);
            }}
            disabled={!shareLink}
            className="px-2 py-1 bg-dark-800 hover:bg-dark-700 disabled:opacity-40 border border-subtle rounded text-[11px]"
          >
            Clipboard
          </button>
        </div>
        {shareLink && (
          <input
            readOnly
            aria-label="Review link"
            value={shareLink}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full bg-dark-950 border border-subtle rounded px-2 py-1 font-mono text-[9px] text-neutral-400"
          />
        )}
        <div className="flex space-x-2">
          <input
            aria-label="Import review link"
            placeholder="Paste review link to merge…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleImportLink((e.target as HTMLInputElement).value);
            }}
            className="flex-1 bg-dark-950 border border-subtle rounded px-2 py-1 text-[10px]"
          />
        </div>
        {linkError && (
          <div className="text-rose-400 text-[10px] flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>{linkError}</span>
          </div>
        )}

        {/* Publish check */}
        <div className="pt-2 border-t border-subtle/60 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            1-click publish check
          </div>
          <div className="flex items-center space-x-2">
            <select
              aria-label="Publish preset"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              className="flex-1 bg-dark-950 border border-subtle rounded px-2 py-1 text-[11px]"
            >
              {SOCIAL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.aspectRatio})
                </option>
              ))}
            </select>
            <button
              onClick={handlePublishCheck}
              className="flex items-center space-x-1 px-2 py-1 bg-indigo-accent hover:bg-indigo-hover text-white rounded text-[11px]"
            >
              <Send className="w-3 h-3" />
              <span>Check</span>
            </button>
          </div>
          <div className="text-[10px] text-neutral-500">
            Master: {metadata.width}×{metadata.height}
          </div>
          {publishError && (
            <div className="text-rose-400 text-[10px] break-words">{publishError}</div>
          )}
          {publishOk && (
            <div className="text-teal-400 text-[10px]">{publishOk}</div>
          )}
        </div>
      </div>
    </div>
  );
};
