import React, { useState, useEffect } from 'react';
import { ExportConfig } from '../engine/exportEngine';
import { Share2, Cpu, Sliders, Film, Captions, Music2 } from 'lucide-react';
import { nativeBridge } from '../services/nativeBridge';
import { useExportQueueStore } from '../engine/exportQueue';
import { ExportQueue } from './ExportQueue';
import { SOCIAL_PRESETS, SocialPreset } from '../engine/exportPresets';
import { useTimelineStore } from '../store/timelineStore';
import {
  harvestCaptionWords,
  wordsToSidecar,
  downloadSidecar,
  SidecarFormat,
} from '../engine/captions/sidecar';
import {
  findMusicBedClip,
  musicBedEditCommands,
  targetFromSeconds,
} from '../engine/musicEditor';

export const ExportModal: React.FC = () => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('tiktok_reels');
  const [availableEncoders, setAvailableEncoders] = useState<string[]>(['Software x264']);
  const [selectedEncoder, setSelectedEncoder] = useState<ExportConfig['encoder']>('Software x264');
  const [customPath, setCustomPath] = useState<string>('');
  const [sidecarFormat, setSidecarFormat] = useState<SidecarFormat>('srt');
  const [sidecarStatus, setSidecarStatus] = useState<string | null>(null);
  const [bedTargetSec, setBedTargetSec] = useState<string>('30');
  const [bedStatus, setBedStatus] = useState<string | null>(null);
  const addJob = useExportQueueStore((state) => state.addJob);
  const tracks = useTimelineStore((state) => state.tracks);
  const metadata = useTimelineStore((state) => state.metadata);
  const executeCommand = useTimelineStore((state) => state.executeCommand);

  useEffect(() => {
    const fetchEncoders = async () => {
      try {
        const encoders = await nativeBridge.getAvailableEncoders();
        if (encoders && encoders.length > 1) {
          setAvailableEncoders(encoders);
          setSelectedEncoder(encoders[encoders.length - 1] as ExportConfig['encoder']); // select best hw encoder
        } else {
          setAvailableEncoders(['Software x264']);
          setSelectedEncoder('Software x264');
        }
      } catch (err) {
        console.warn('Failed to fetch encoders:', err);
      }
    };
    fetchEncoders();
  }, []);

  const currentPreset: SocialPreset = SOCIAL_PRESETS.find((p) => p.id === selectedPresetId) || SOCIAL_PRESETS[0];

  const handleStartExport = () => {
    const cleanName = currentPreset.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outputPath = customPath.trim() || `/exports/${cleanName}.mp4`;

    addJob({
      presetName: currentPreset.name,
      width: currentPreset.width,
      height: currentPreset.height,
      fps: currentPreset.fps,
      bitrateMbps: currentPreset.bitrateMbps,
      encoder: selectedEncoder,
      outputPath,
      targetLufs: currentPreset.targetLufs,
      colorSpace: currentPreset.colorSpace,
      aspectRatio: currentPreset.aspectRatio,
    });
  };

  // R25.6 — sidecar download from real timeline caption effects.
  const handleExportSidecar = () => {
    try {
      const words = harvestCaptionWords(tracks);
      const content = wordsToSidecar(words, sidecarFormat, 'word');
      const base = (metadata?.name || 'captions').replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadSidecar(content, `${base}.${sidecarFormat}`, sidecarFormat);
      setSidecarStatus(`Exported ${words.length} word cue(s) → .${sidecarFormat}`);
    } catch (err) {
      setSidecarStatus(err instanceof Error ? err.message : String(err));
    }
  };

  // R25.6 — fit music bed to an exact rational target (trim / loop, speed 1.0).
  const handleFitMusicBed = () => {
    try {
      const found = findMusicBedClip(tracks);
      if (!found) {
        setBedStatus('No music bed clip found (role=music or name "Music Bed")');
        return;
      }
      const rate = 60000;
      const target = targetFromSeconds(Number(bedTargetSec), rate);
      const { plan, transaction } = musicBedEditCommands(found.track, found.clip, target, rate);
      executeCommand(transaction);
      setBedStatus(
        `Bed ${plan.mode}: ${(plan.resultDuration.value / plan.resultDuration.rate).toFixed(3)}s ` +
          `(${plan.segments.length} segment${plan.segments.length === 1 ? '' : 's'})`
      );
    } catch (err) {
      setBedStatus(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 flex flex-col space-y-4 max-w-md w-full m-auto shadow-2xl text-xs text-neutral-200 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <div className="flex items-center space-x-2 font-bold text-sm text-neutral-100">
          <Share2 className="w-4 h-4 text-indigo-400" />
          <span>Hardware Accelerated Export Studio</span>
        </div>
        <span className="text-[10px] bg-neutral-800 border border-neutral-700 text-neutral-400 px-1.5 py-0.5 rounded font-mono">
          R18 Real Pipeline
        </span>
      </div>

      {/* Preset Target Selection (Roadmap R18.2) */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
          <Film className="w-3.5 h-3.5 text-indigo-400" />
          <span>Social Platform & Broadcast Presets</span>
        </label>
        <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
          {SOCIAL_PRESETS.map((p) => {
            const isSelected = selectedPresetId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPresetId(p.id)}
                className={`flex flex-col p-2.5 rounded border transition-all text-left ${
                  isSelected
                    ? 'bg-indigo-950/70 border-indigo-500 text-white shadow-sm'
                    : 'bg-neutral-950 border-neutral-800/90 text-neutral-400 hover:text-neutral-200 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span>{p.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-neutral-800 text-neutral-300 rounded font-mono">
                      {p.badge}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400">
                    {p.targetLufs} LUFS
                  </span>
                </div>
                <div className="text-[10px] text-neutral-500 flex items-center justify-between font-mono">
                  <span>{p.width}x{p.height} @ {p.fps}fps</span>
                  <span>{p.bitrateMbps} Mbps | {p.colorSpace.toUpperCase()}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Output Filename / Path */}
      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
          <span>Output Destination</span>
          <span className="text-[10px] text-neutral-500 font-mono">Auto-named</span>
        </label>
        <input
          type="text"
          placeholder={`/exports/${currentPreset.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`}
          value={customPath}
          onChange={(e) => setCustomPath(e.target.value)}
          className="w-full bg-neutral-950 border border-neutral-800 rounded px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-indigo-500 font-mono"
        />
      </div>

      {/* Encoder Hardware Info (Roadmap R18.1) */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5 text-green-400" />
          <span>GPU Hardware Encoder</span>
        </label>
        <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 flex items-center justify-between font-mono text-[10px] text-neutral-400">
          <span className="flex items-center">
            <Cpu className="w-3.5 h-3.5 mr-1.5 text-green-400" /> Encoder:
          </span>
          {availableEncoders.length > 1 ? (
            <select
              data-testid="encoder-select"
              value={selectedEncoder}
              onChange={(e) => setSelectedEncoder(e.target.value as ExportConfig['encoder'])}
              className="bg-neutral-900 border border-neutral-700 text-green-300 font-semibold p-1 rounded"
            >
              {availableEncoders.map((enc) => (
                <option key={enc} value={enc}>
                  {enc}
                </option>
              ))}
            </select>
          ) : (
            <span data-testid="encoder-fallback" className="text-green-300 font-semibold">
              Software x264
            </span>
          )}
        </div>
      </div>

      {/* R25.6 — caption sidecar export */}
      <div className="space-y-1.5 border-t border-neutral-800 pt-2">
        <label className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
          <Captions className="w-3.5 h-3.5 text-sky-400" />
          <span>Caption Sidecar (R25.6)</span>
        </label>
        <div className="flex items-center gap-2">
          <select
            data-testid="sidecar-format"
            value={sidecarFormat}
            onChange={(e) => setSidecarFormat(e.target.value as SidecarFormat)}
            className="bg-neutral-900 border border-neutral-700 text-neutral-200 p-1 rounded text-[11px]"
          >
            <option value="srt">SRT</option>
            <option value="vtt">WebVTT</option>
          </select>
          <button
            data-testid="export-sidecar"
            onClick={handleExportSidecar}
            className="flex-1 py-1.5 bg-sky-800 hover:bg-sky-700 text-white font-semibold rounded text-[11px] transition-all"
          >
            Download .{sidecarFormat}
          </button>
        </div>
        {sidecarStatus && (
          <div data-testid="sidecar-status" className="text-[10px] text-neutral-400 break-words">
            {sidecarStatus}
          </div>
        )}
      </div>

      {/* R25.6 — music bed duration fit */}
      <div className="space-y-1.5 border-t border-neutral-800 pt-2">
        <label className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
          <Music2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Fit Music Bed (R25.6)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            data-testid="bed-target"
            type="number"
            min="0.1"
            step="0.1"
            value={bedTargetSec}
            onChange={(e) => setBedTargetSec(e.target.value)}
            className="w-20 bg-neutral-950 border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-200 font-mono focus:outline-none focus:border-amber-500"
          />
          <span className="text-[10px] text-neutral-500 font-mono">seconds</span>
          <button
            data-testid="fit-bed"
            onClick={handleFitMusicBed}
            className="flex-1 py-1.5 bg-amber-700 hover:bg-amber-600 text-white font-semibold rounded text-[11px] transition-all"
          >
            Fit Bed
          </button>
        </div>
        {bedStatus && (
          <div data-testid="bed-status" className="text-[10px] text-neutral-400 break-words">
            {bedStatus}
          </div>
        )}
      </div>

      {/* Export Action Button */}
      <button
        onClick={handleStartExport}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow transition-all flex items-center justify-center space-x-2 text-xs"
      >
        <Share2 className="w-4 h-4" />
        <span>Add to Render Queue</span>
      </button>

      {/* Render Queue (Roadmap R18.3) */}
      <ExportQueue />
    </div>
  );
};
