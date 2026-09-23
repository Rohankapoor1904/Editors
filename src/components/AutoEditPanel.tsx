import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { runAutoEdit, defaultPerceptionServices, RawFootage } from '../engine/autoEdit/autoEditPipeline';
import { rationalToSeconds } from '../types/time';
import { Wand2, Clapperboard } from 'lucide-react';

/**
 * R25.1 — AI Auto-Edit panel: pick raw footage, set the quality bar, run
 * the full perception→score→assemble pipeline through the REAL on-device
 * services, and land the rough cut in one undoable transaction. Every
 * failure surfaces as status text — the panel never fabricates a take.
 */
export const AutoEditPanel: React.FC = () => {
  const { tracks, playheadPosition, metadata, executeCommand } = useTimelineStore();
  const { assets } = useMediaPoolStore();

  const footageAssets = React.useMemo(
    () => assets.filter((a) => (a.type === 'video' || a.type === 'audio') && !a.isOffline),
    [assets]
  );
  const [selected, setSelected] = React.useState<string[]>([]);
  const [threshold, setThreshold] = React.useState(40);
  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [reasons, setReasons] = React.useState<string[]>([]);

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleRun = async (): Promise<void> => {
    if (running || selected.length === 0) return;
    const targetTrack = tracks.find((t) => t.type === 'video') ?? tracks[0];
    if (!targetTrack) {
      setStatus('Auto-Edit failed: no timeline track available.');
      return;
    }
    setRunning(true);
    setStatus('Listening to footage…');
    setReasons([]);
    try {
      const byId = new Map(assets.map((a) => [a.id, a]));
      const footage: RawFootage[] = selected.map((id) => {
        const asset = byId.get(id);
        if (!asset) throw new Error(`Selected asset "${id}" left the media pool.`);
        const durationSec = parseDurationSeconds(asset.duration);
        if (!(durationSec > 0)) {
          throw new Error(`Cannot assemble "${asset.name}": unparsable duration — refusing to invent a take length.`);
        }
        return { assetId: asset.id, assetName: asset.name, mediaPath: asset.path, durationSec };
      });
      const rate = Math.max(1, Math.round(metadata.fps));
      const result = await runAutoEdit(footage, defaultPerceptionServices, {
        trackId: targetTrack.id,
        startAtSec: rationalToSeconds(playheadPosition),
        rate,
        qualityThreshold: threshold,
      });
      executeCommand(result.transaction);
      setStatus(`Rough cut ready: kept ${result.kept}, dropped ${result.dropped} (one undo reverts all).`);
      setReasons(result.takes.map((t) => `${t.assetName}: ${t.score.verdict} ${t.score.score} — ${t.score.reasons.join('; ')}`));
    } catch (err) {
      setStatus(`Auto-Edit failed: ${(err as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  if (footageAssets.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-neutral-500 text-xs select-none">
        <Clapperboard className="w-4 h-4 mr-1.5" />
        Import footage into the media pool to auto-edit.
      </div>
    );
  }

  return (
    <div className="flex flex-col p-3 space-y-2 select-none">
      <div className="flex items-center space-x-2">
        <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
        <h3 className="text-xs font-semibold text-neutral-200 tracking-wide uppercase">Auto-Edit</h3>
      </div>
      <div className="flex flex-col space-y-1 max-h-40 overflow-y-auto">
        {footageAssets.map((asset) => (
          <label key={asset.id} className="flex items-center space-x-2 text-[11px] text-neutral-300 cursor-pointer">
            <input
              type="checkbox"
              aria-label={`Select ${asset.name}`}
              checked={selected.includes(asset.id)}
              onChange={() => toggle(asset.id)}
              className="accent-indigo-500"
            />
            <span className="truncate">{asset.name}</span>
            <span className="font-mono text-neutral-500">{asset.duration}</span>
          </label>
        ))}
      </div>
      <label className="flex items-center space-x-2 text-[11px] text-neutral-400">
        <span className="w-20 shrink-0">Quality bar</span>
        <input
          type="range"
          aria-label="Quality threshold"
          min={0}
          max={100}
          step={5}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="flex-1 accent-indigo-500"
        />
        <span className="w-8 text-right font-mono">{threshold}</span>
      </label>
      <button
        onClick={handleRun}
        disabled={selected.length === 0 || running}
        title={selected.length === 0 ? 'Select at least one footage asset' : 'Transcribe, score and assemble the selects'}
        className="w-full text-xs px-2.5 py-1.5 rounded font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {running ? 'Listening…' : `Assemble rough cut (${selected.length})`}
      </button>
      {status && <div className="text-[11px] text-neutral-400">{status}</div>}
      {reasons.length > 0 && (
        <ul className="text-[10px] font-mono text-neutral-500 space-y-0.5 max-h-24 overflow-y-auto">
          {reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Best-effort seconds parser for pool duration strings ("v/r", "HH:MM:SS"). */
function parseDurationSeconds(raw: string | undefined): number {
  if (!raw) return NaN;
  if (raw.includes('/')) {
    const [v, r] = raw.split('/').map(Number);
    if (Number.isFinite(v) && Number.isFinite(r) && r > 0) return v / r;
    return NaN;
  }
  const match = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(raw.trim());
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
