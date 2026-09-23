import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { AudioRole } from '../types/timeline';
import { rolePreset, validateRole } from '../engine/essentialSound';
import { matchTone } from '../engine/dialogueMatcher';
import { parametricEqEngine } from '../engine/parametricEq';
import { STANDARD_EQ_FREQUENCIES } from '../engine/parametricEq';
import { analyzeClipBands } from '../services/audioAnalyze';
import { AudioLines } from 'lucide-react';

const ROLES: AudioRole[] = ['dialogue', 'music', 'sfx', 'ambience'];

/**
 * R24.3 — Essential Sound panel: role tagging with preset EQ, per-clip
 * compressor + de-esser params (stored on the clip's audioEffects chain),
 * and an honestly-disabled Match button (reference spectrum capture
 * plumbing does not exist yet — the matcher solver is engine-tested).
 */
export const EssentialSoundPanel: React.FC = () => {
  const { selectedClipIds, tracks, setClipAudioRole, upsertClipAudioEffect } = useTimelineStore();
  const [status, setStatus] = React.useState<string | null>(null);
  const [refId, setRefId] = React.useState('');
  const [matching, setMatching] = React.useState(false);
  const [matchStatus, setMatchStatus] = React.useState<string | null>(null);

  const selectedClip = React.useMemo(() => {
    const id = Array.isArray(selectedClipIds) && typeof selectedClipIds[0] === 'string'
      ? selectedClipIds[0]
      : null;
    if (!id) return null;
    return tracks
      .flatMap((t) => (Array.isArray(t.clips) ? t.clips : []))
      .find((c) => c && c.id === id) ?? null;
  }, [tracks, selectedClipIds]);

  const compEntry = selectedClip?.audioEffects?.find((e) => e.type === 'dynamics_compressor');
  const deessEntry = selectedClip?.audioEffects?.find((e) => e.type === 'dynamics_deesser');
  const compThreshold = Number((compEntry?.params as { thresholdDb?: unknown } | undefined)?.thresholdDb ?? -12);
  const compRatio = Number((compEntry?.params as { ratio?: unknown } | undefined)?.ratio ?? 3);
  const deessAmount = Number((deessEntry?.params as { amount?: unknown } | undefined)?.amount ?? 0.5);

  if (!selectedClip) {
    return (
      <div
        data-testid="ess-panel"
        className="bg-neutral-900/80 p-4 rounded-lg border border-neutral-800 shadow-md text-neutral-500 text-xs"
      >
        Select a clip to tag its Essential Sound role.
      </div>
    );
  }

  const handleRole = (role: AudioRole): void => {
    validateRole(role);
    setClipAudioRole(selectedClip.id, role);
    const preset = rolePreset(role);
    // Write the preset as absolute band gains on the live EQ chain.
    // setBandGain no-ops per band until the engine is initialised.
    preset.eqGainsDb.forEach((gainDb, i) => {
      parametricEqEngine.setBandGain(i, gainDb);
    });
    setStatus(`${preset.description} (bus trim ${preset.trimDb} dB)`);
  };

  const handleComp = (thresholdDb: number, ratio: number): void => {
    upsertClipAudioEffect(selectedClip.id, 'dyn_comp', 'dynamics_compressor', { thresholdDb, ratio });
  };

  const handleDeess = (amount: number): void => {
    upsertClipAudioEffect(selectedClip.id, 'dyn_deess', 'dynamics_deesser', { amount });
  };

  const refCandidates = React.useMemo(() => {
    if (!selectedClip) return [];
    return tracks
      .filter((t) => t.type === 'audio')
      .flatMap((t) => (Array.isArray(t.clips) ? t.clips : []))
      .filter((c) => c && c.id !== selectedClip.id);
  }, [tracks, selectedClip]);

  const handleMatch = async (): Promise<void> => {
    if (!selectedClip || !refId || matching) return;
    const ref = refCandidates.find((c) => c.id === refId);
    if (!ref) {
      setMatchStatus('Reference clip not found');
      return;
    }
    setMatching(true);
    setMatchStatus('Analyzing spectra…');
    try {
      const centers = [...STANDARD_EQ_FREQUENCIES];
      const [targetBands, refBands] = await Promise.all([
        analyzeClipBands(selectedClip.assetId, centers),
        analyzeClipBands(ref.assetId, centers),
      ]);
      const deltas = matchTone(targetBands, refBands, centers);
      upsertClipAudioEffect(selectedClip.id, 'eq_match', 'eq_match', {
        bands: deltas.map((d) => ({ hz: d.centerHz, db: d.gainDb })),
      });
      // Audible now: role-preset base (or flat) plus the correction on the
      // live 10-band chain. setBandGain no-ops until the engine initializes.
      const base = selectedClip.audioRole
        ? rolePreset(selectedClip.audioRole).eqGainsDb
        : centers.map(() => 0);
      deltas.forEach((d, i) => {
        try {
          parametricEqEngine.setBandGain(i, base[i] + d.gainDb);
        } catch {
          // Engine down: the eq_match entry above still records the match.
        }
      });
      const peak = Math.max(...deltas.map((d) => Math.abs(d.gainDb)));
      setMatchStatus(`Matched to ${ref.name}: peak correction ${peak.toFixed(1)} dB`);
    } catch (err) {
      setMatchStatus(`Match failed: ${(err as Error).message}`);
    } finally {
      setMatching(false);
    }
  };

  const sliderRow = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (v: number) => void
  ): React.ReactNode => (
    <label className="flex items-center space-x-2 text-xs text-neutral-400">
      <span className="w-28 shrink-0">{label}</span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-cyan-500"
      />
      <span className="w-16 text-right font-mono text-neutral-500">
        {value.toFixed(step < 0.1 ? 2 : 1)}{unit}
      </span>
    </label>
  );

  return (
    <div
      data-testid="ess-panel"
      className="bg-neutral-900/80 p-4 rounded-lg border border-neutral-800 shadow-md flex flex-col space-y-3"
    >
      <div className="flex items-center gap-2">
        <AudioLines className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-bold text-neutral-200">Essential Sound</h3>
      </div>

      <div className="flex items-center space-x-2">
        <span className="text-xs text-neutral-400 w-28">Role</span>
        <select
          aria-label="Audio role"
          value={selectedClip.audioRole ?? ''}
          onChange={(e) => handleRole(e.target.value as AudioRole)}
          className="bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-700"
        >
          <option value="">Untagged</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        {status && <span className="text-[11px] text-neutral-500">{status}</span>}
      </div>

      <div className="flex flex-col space-y-2 border-t border-neutral-800 pt-3">
        {sliderRow('Comp threshold', compThreshold, -40, 0, 1, ' dB', (v) => handleComp(v, compRatio))}
        {sliderRow('Comp ratio', compRatio, 1, 20, 0.5, ' :1', (v) => handleComp(compThreshold, v))}
        {sliderRow('De-esser', Math.round(deessAmount * 100), 0, 100, 1, ' %', (v) =>
          handleDeess(v / 100)
        )}
      </div>

      <div className="flex items-center space-x-2 border-t border-neutral-800 pt-3">
        <span className="text-xs text-neutral-400 w-28">Match ref</span>
        <select
          aria-label="Reference clip"
          value={refId}
          onChange={(e) => setRefId(e.target.value)}
          className="flex-1 bg-neutral-800 text-neutral-200 text-xs rounded px-2 py-1 border border-neutral-700"
        >
          <option value="">Pick reference…</option>
          {refCandidates.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleMatch}
        disabled={!refId || matching}
        title={
          !refId
            ? 'Pick a reference clip first'
            : 'Analyze both clips and write an EQ match onto this clip'
        }
        className="text-xs px-2.5 py-1 rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {matching ? 'Analyzing…' : 'Match to reference'}
      </button>
      {matchStatus && <div className="text-[11px] text-neutral-500">{matchStatus}</div>}
    </div>
  );
};

