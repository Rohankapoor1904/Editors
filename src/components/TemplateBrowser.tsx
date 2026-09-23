import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { CREATOR_TEMPLATES, creatorTemplate } from '../engine/templates/creatorTemplates';
import { captionPresetUpdates } from '../engine/templates/creatorTemplates';
import { titleTemplate } from '../engine/titles';
import { planBeatCuts } from '../engine/beatCut';
import { fetchAssetBytes, decodeToMono } from '../services/audioAnalyze';
import { beatDetector } from '../engine/beatDetector';
import { SetMetadataCommand } from '../core/commands/storeCommands';
import { SplitCommand } from '../core/commands/edits';
import { rationalToSeconds, secondsToRational, createRational, compareRational, addRational } from '../types/time';
import { LayoutTemplate, Scissors } from 'lucide-react';

/**
 * R25.4 — creator template browser + beat-synced cuts.
 *
 * Templates apply through real paths: canvas size via SetMetadataCommand,
 * caption presets via the clip caption effects the monitor syncs from,
 * and the outro as a title clip. Beat cuts run the real onset detector
 * over decoded samples and split sequentially (one undo per cut, standard
 * NLE behavior). Synthetic beat fallbacks are never consumed.
 */
export const TemplateBrowser: React.FC = () => {
  const {
    tracks, metadata, playheadPosition,
    executeCommand, updateClipEffect, addTitleClip,
  } = useTimelineStore();
  const [status, setStatus] = React.useState<string | null>(null);
  const [beatClipId, setBeatClipId] = React.useState('');
  const [maxCuts, setMaxCuts] = React.useState(3);
  const [cutting, setCutting] = React.useState(false);

  const videoTrack = tracks.find((t) => t.type === 'video' && !t.locked) ?? null;
  const audioClips = React.useMemo(
    () => tracks.filter((t) => t.type === 'audio').flatMap((t) => t.clips),
    [tracks]
  );

  const handleApplyTemplate = (templateId: string): void => {
    try {
      const tpl = creatorTemplate(templateId);
      executeCommand(new SetMetadataCommand({ width: tpl.canvasWidth, height: tpl.canvasHeight }));

      const captioned = tracks.flatMap((t) => t.clips);
      const { updates, skipped } = captionPresetUpdates(captioned, tpl.captionPreset);
      for (const u of updates) {
        updateClipEffect(u.clipId, u.effectId, 'caption', { preset: u.preset });
      }

      let outro = 'no outro in template';
      if (tpl.outroTitleTemplateId && tpl.outroDurationSec && videoTrack) {
        const spec = titleTemplate(tpl.outroTitleTemplateId).spec;
        const lastEnd = videoTrack.clips.reduce(
          (end, c) => Math.max(end, rationalToSeconds(c.startOffset) + rationalToSeconds(c.duration)),
          rationalToSeconds(playheadPosition)
        );
        const dur = createRational(Math.round(tpl.outroDurationSec * metadata.fps), Math.round(metadata.fps));
        addTitleClip(videoTrack.id, `tplout_${Date.now()}`, { ...spec, text: spec.text }, secondsToRational(lastEnd), dur);
        outro = `outro placed (${tpl.outroDurationSec}s)`;
      }
      setStatus(
        `${tpl.name}: canvas ${tpl.canvasWidth}×${tpl.canvasHeight}, ` +
        `captions → ${tpl.captionPreset} on ${updates.length} clip${updates.length === 1 ? '' : 's'}` +
        `${skipped > 0 ? ` (${skipped} without words skipped)` : ''}, ${outro}.`
      );
    } catch (err) {
      setStatus(`Template failed: ${(err as Error).message}`);
    }
  };

  const handleBeatCuts = async (): Promise<void> => {
    if (!beatClipId || cutting) return;
    const clip = audioClips.find((c) => c.id === beatClipId);
    if (!clip) {
      setStatus('Beat cuts failed: music clip not found.');
      return;
    }
    setCutting(true);
    setStatus('Detecting beats…');
    try {
      const asset = useMediaPoolStore.getState().assets.find((a) => a.id === clip.assetId) ?? null;
      if (!asset) throw new Error(`No pool asset for clip "${clip.name}" — cannot read samples.`);
      const bytes = await fetchAssetBytes(asset.path);
      const { samples, sampleRate } = await decodeToMono(bytes);
      const { beats } = beatDetector.detectBeatsFromSamples(samples, sampleRate);
      const clipStartSec = rationalToSeconds(clip.startOffset);
      const clipDurSec = rationalToSeconds(clip.duration);
      const cuts = planBeatCuts(clipDurSec, beats, maxCuts);
      // Sequential splits, re-resolved by time span after each cut (split
      // mints new ids, so no id is reused). Scoped to the source track so
      // cuts never leak onto other tracks' clips. One undo per cut,
      // standard NLE behavior; boundary-exact cuts are skipped, never forced.
      let applied = 0;
      const appliedAt: number[] = [];
      const live0 = useTimelineStore.getState();
      const homeTrack = live0.tracks.find((t) => t.clips.some((c) => c.id === beatClipId)) ?? null;
      for (const cut of cuts) {
        const live = useTimelineStore.getState();
        const cutAt = secondsToRational(clipStartSec + cut);
        const pool = homeTrack
          ? (live.tracks.find((t) => t.id === homeTrack.id)?.clips ?? [])
          : live.tracks.flatMap((t) => t.clips);
        const spanning = pool.find((c) => {
          const start = c.startOffset;
          const end = addRational(start, c.duration);
          return compareRational(start, cutAt) < 0 && compareRational(cutAt, end) < 0;
        });
        if (!spanning) continue;
        try {
          executeCommand(new SplitCommand(spanning.id, cutAt));
          applied++;
          appliedAt.push(clipStartSec + cut);
        } catch {
          // Racing edit moved the span: skip this cut loudly below.
        }
      }
      setStatus(
        applied === cuts.length
          ? `Cut on ${applied} beat${applied === 1 ? '' : 's'} at ${appliedAt.map((t) => t.toFixed(2)).join(', ')}s (one undo per cut).`
          : `Cut on ${applied}/${cuts.length} beats — ${cuts.length - applied} skipped (no strictly containing clip).`
      );
    } catch (err) {
      setStatus(`Beat cuts failed: ${(err as Error).message}`);
    } finally {
      setCutting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-950 text-neutral-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <LayoutTemplate className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Templates</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 text-xs">
        {CREATOR_TEMPLATES.map((tpl) => (
          <div key={tpl.id} className="bg-neutral-900/80 p-3 rounded-lg border border-neutral-800 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-100">{tpl.name}</span>
              <span className="font-mono text-[10px] text-neutral-500">
                {tpl.canvasWidth}×{tpl.canvasHeight}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">{tpl.description}</p>
            <button
              onClick={() => handleApplyTemplate(tpl.id)}
              className="text-[11px] px-2.5 py-1 rounded font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Apply template
            </button>
          </div>
        ))}

        <div className="bg-neutral-900/80 p-3 rounded-lg border border-neutral-800 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-neutral-100">
            <Scissors className="w-3.5 h-3.5 text-emerald-400" />
            <span>Beat-synced cuts</span>
          </div>
          <label className="flex items-center space-x-2 text-[11px] text-neutral-400">
            <span className="w-20 shrink-0">Music clip</span>
            <select
              aria-label="Beat source clip"
              value={beatClipId}
              onChange={(e) => setBeatClipId(e.target.value)}
              className="flex-1 min-w-0 bg-neutral-800 text-neutral-200 rounded px-2 py-1 border border-neutral-700"
            >
              <option value="">Pick a music clip…</option>
              {audioClips.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center space-x-2 text-[11px] text-neutral-400">
            <span className="w-20 shrink-0">Max cuts</span>
            <input
              type="range"
              aria-label="Max beat cuts"
              min={1}
              max={8}
              step={1}
              value={maxCuts}
              onChange={(e) => setMaxCuts(Number(e.target.value))}
              className="flex-1 accent-emerald-500"
            />
            <span className="w-6 text-right font-mono">{maxCuts}</span>
          </label>
          <button
            onClick={handleBeatCuts}
            disabled={!beatClipId || cutting}
            title={!beatClipId ? 'Pick a music clip first' : 'Detect beats and split on them'}
            className="w-full text-[11px] px-2.5 py-1.5 rounded font-semibold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {cutting ? 'Detecting…' : 'Cut on beats'}
          </button>
        </div>

        {status && <div className="text-[11px] text-neutral-400">{status}</div>}
      </div>
    </div>
  );
};
