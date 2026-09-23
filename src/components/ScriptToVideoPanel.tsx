import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { parseScriptToScenes, planScriptToVideo, estimateVoSeconds } from '../engine/scriptToVideo';
import { rationalToSeconds } from '../types/time';
import { ScrollText } from 'lucide-react';

/**
 * R25.2 — script-to-video draft panel: paste a script, pick an optional
 * real music bed, and lay scene-title clips (VO-timed estimates) plus the
 * bed in one undoable transaction. Generated voiceover/music do not exist
 * yet — durations are WPM estimates, labelled as such, never synthesized.
 */
export const ScriptToVideoPanel: React.FC = () => {
  const { tracks, playheadPosition, metadata, executeCommand } = useTimelineStore();
  const { assets } = useMediaPoolStore();

  const [script, setScript] = React.useState('');
  const [bedId, setBedId] = React.useState('');
  const [status, setStatus] = React.useState<string | null>(null);

  const audioAssets = React.useMemo(() => assets.filter((a) => a.type === 'audio' && !a.isOffline), [assets]);
  const videoTrack = tracks.find((t) => t.type === 'video' && !t.locked) ?? null;
  const audioTrack = tracks.find((t) => t.type === 'audio' && !t.locked) ?? null;

  const scenePreview = React.useMemo(() => {
    try {
      return script.trim().length === 0 ? [] : parseScriptToScenes(script);
    } catch {
      return [];
    }
  }, [script]);

  const estimatedTotal = scenePreview.reduce((sum, s) => sum + estimateVoSeconds(s.body), 0);

  const handleGenerate = (): void => {
    if (!videoTrack) {
      setStatus('Script-to-video failed: no unlocked video track available.');
      return;
    }
    try {
      const scenes = parseScriptToScenes(script);
      const rate = Math.max(1, Math.round(metadata.fps));
      const result = planScriptToVideo(scenes, {
        trackId: videoTrack.id,
        audioTrackId: bedId ? audioTrack?.id : undefined,
        musicAssetId: bedId || undefined,
        startAtSec: rationalToSeconds(playheadPosition),
        rate,
      });
      executeCommand(result.transaction);
      setStatus(
        `Draft ready: ${result.sceneCount} scenes, ~${estimatedTotal.toFixed(1)}s estimated VO` +
        `${result.bedPlaced ? ' + music bed' : ''} (one undo reverts all).`
      );
    } catch (err) {
      setStatus(`Script-to-video failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-950 text-neutral-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <ScrollText className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Script to Video</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        <label className="flex flex-col space-y-1">
          <span className="text-xs text-neutral-400">
            Script (blank line = new scene · durations are WPM estimates)
          </span>
          <textarea
            aria-label="Script text"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={8}
            placeholder={'Cold Open\nWelcome to the show.\n\nInterview\nMy name is Ada.'}
            className="bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1.5 border border-neutral-700 font-mono"
          />
        </label>

        {scenePreview.length > 0 && (
          <div className="text-[11px] text-neutral-500">
            {scenePreview.length} scene{scenePreview.length > 1 ? 's' : ''} · ~{estimatedTotal.toFixed(1)}s estimated VO
          </div>
        )}

        <label className="flex items-center space-x-2 text-xs text-neutral-400">
          <span className="w-20 shrink-0">Music bed</span>
          <select
            aria-label="Music bed asset"
            value={bedId}
            onChange={(e) => setBedId(e.target.value)}
            className="flex-1 min-w-0 bg-neutral-800 text-neutral-200 rounded px-2 py-1 border border-neutral-700"
          >
            <option value="">None (scenes only)</option>
            {audioAssets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        {bedId !== '' && !audioTrack && (
          <div className="text-[11px] text-amber-400">No unlocked audio track for the bed.</div>
        )}

        <button
          onClick={handleGenerate}
          disabled={script.trim().length === 0 || !videoTrack}
          title={
            !videoTrack
              ? 'No unlocked video track available'
              : 'Lay scene cards plus the bed in one undoable draft'
          }
          className="w-full text-xs px-2.5 py-1.5 rounded font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Generate draft timeline
        </button>
        {status && <div className="text-[11px] text-neutral-400">{status}</div>}
      </div>
    </div>
  );
};
