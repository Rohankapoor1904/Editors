import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import {
  listSystemVoices,
  previewVoice,
  startVoiceRecording,
  placeVoiceoverTake,
  SystemVoice,
} from '../services/voiceover';
import { secondsToRational, rationalToSeconds } from '../types/time';
import { Mic, Square, Play, Sparkles } from 'lucide-react';

/**
 * R25.3 — voiceover panel: system-voice preview, microphone takes placed
 * on the timeline, and one-click enhancement through the R17.3 spectral
 * path. Offline neural TTS is explicitly unavailable (no bundled model) —
 * the panel says so instead of offering a fake render button.
 */
export const VoiceoverPanel: React.FC = () => {
  const { tracks, playheadPosition, addClipToTrack, applyNoiseIsolation } = useTimelineStore();
  const [voices, setVoices] = React.useState<SystemVoice[]>([]);
  const [voiceURI, setVoiceURI] = React.useState('');
  const [previewText, setPreviewText] = React.useState('Hello, this is a voiceover preview.');
  const [recording, setRecording] = React.useState(false);
  const [elapsedSec, setElapsedSec] = React.useState(0);
  const [status, setStatus] = React.useState<string | null>(null);
  const [enhancing, setEnhancing] = React.useState(false);
  const controllerRef = React.useRef<ReturnType<typeof startVoiceRecording> | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setVoices(listSystemVoices());
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const handlePreview = (): void => {
    try {
      previewVoice(previewText, voiceURI || undefined);
      setStatus(`Previewing with ${voices.find((v) => v.voiceURI === voiceURI)?.name ?? 'default voice'}…`);
    } catch (err) {
      setStatus(`Preview failed: ${(err as Error).message}`);
    }
  };

  const handleRecordToggle = (): void => {
    if (recording) {
      void (async () => {
        try {
          const take = await controllerRef.current?.stopRecording();
          if (timerRef.current) window.clearInterval(timerRef.current);
          setRecording(false);
          if (!take) return;
          const asset = placeVoiceoverTake(take, `VO Take ${new Date().toLocaleTimeString()}`);
          const targetTrack = tracks.find((t) => t.type === 'audio' && !t.locked) ?? null;
          if (!targetTrack) {
            setStatus(`Recorded ${take.durationSec.toFixed(1)}s but no unlocked audio track exists.`);
            return;
          }
          const duration = secondsToRational(Math.max(0.5, take.durationSec));
          addClipToTrack(targetTrack.id, {
            id: `clip_vo_${Date.now()}`,
            assetId: asset.id,
            name: asset.name,
            startOffset: { ...playheadPosition },
            sourceIn: secondsToRational(0),
            sourceOut: duration,
            duration,
          });
          setStatus(`Take placed (${take.durationSec.toFixed(1)}s performed). Select it and Enhance to clean it up.`);
        } catch (err) {
          setRecording(false);
          setStatus(`Recording failed: ${(err as Error).message}`);
        } finally {
          controllerRef.current = null;
        }
      })();
      return;
    }
    try {
      controllerRef.current = startVoiceRecording();
      setRecording(true);
      setElapsedSec(0);
      setStatus('Recording… speak now.');
      const started = Date.now();
      timerRef.current = window.setInterval(() => {
        setElapsedSec((Date.now() - started) / 1000);
      }, 250);
    } catch (err) {
      setStatus(`Recording failed: ${(err as Error).message}`);
    }
  };

  const selectedClip = useTimelineStore((s) => {
    const id = Array.isArray(s.selectedClipIds) && typeof s.selectedClipIds[0] === 'string' ? s.selectedClipIds[0] : null;
    if (!id) return null;
    return s.tracks.flatMap((t) => t.clips).find((c) => c.id === id) ?? null;
  });

  const handleEnhance = async (): Promise<void> => {
    if (!selectedClip || enhancing) return;
    setEnhancing(true);
    setStatus('Running voice isolation + leveler…');
    try {
      const res = await applyNoiseIsolation(selectedClip.id, 0.75, true);
      if (res) {
        setStatus(`Voice isolated: +${res.snrImprovementDb.toFixed(1)} dB SNR.`);
      } else {
        setStatus('Enhancement finished.');
      }
    } catch (err) {
      setStatus(`Enhancement failed: ${(err as Error).message}`);
    } finally {
      setEnhancing(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-950 text-neutral-200">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800">
        <Mic className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold">Voiceover</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 text-xs">
        <div className="space-y-1.5">
          <div className="text-neutral-400 font-semibold uppercase tracking-wide text-[10px]">System voice preview</div>
          {voices.length === 0 ? (
            <div className="text-[11px] text-neutral-500">No system voices on this host.</div>
          ) : (
            <select
              aria-label="Preview voice"
              value={voiceURI}
              onChange={(e) => setVoiceURI(e.target.value)}
              className="w-full bg-neutral-800 text-neutral-200 rounded px-2 py-1 border border-neutral-700"
            >
              <option value="">Default voice</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
              ))}
            </select>
          )}
          <div className="flex items-center space-x-2">
            <input
              aria-label="Preview text"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              className="flex-1 min-w-0 bg-neutral-800 text-neutral-200 rounded px-2 py-1 border border-neutral-700"
            />
            <button
              onClick={handlePreview}
              className="flex items-center space-x-1 px-2 py-1 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 transition-colors"
            >
              <Play className="w-3 h-3" />
              <span>Speak</span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5 border-t border-neutral-800 pt-3">
          <div className="text-neutral-400 font-semibold uppercase tracking-wide text-[10px]">Microphone take</div>
          <button
            onClick={handleRecordToggle}
            className={`w-full flex items-center justify-center space-x-2 px-2.5 py-1.5 rounded font-semibold transition-colors ${
              recording ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {recording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            <span>{recording ? `Stop (${elapsedSec.toFixed(1)}s)` : 'Record take'}</span>
          </button>
          <div className="text-[11px] text-neutral-500">
            Takes land on the first unlocked audio track at {rationalToSeconds(playheadPosition).toFixed(1)}s.
          </div>
        </div>

        <div className="space-y-1.5 border-t border-neutral-800 pt-3">
          <div className="text-neutral-400 font-semibold uppercase tracking-wide text-[10px]">Enhance selected clip</div>
          <button
            onClick={handleEnhance}
            disabled={!selectedClip || enhancing}
            title={selectedClip ? `Isolate + level ${selectedClip.name}` : 'Select an audio clip first'}
            className="w-full flex items-center justify-center space-x-2 px-2.5 py-1.5 rounded font-semibold bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{enhancing ? 'Enhancing…' : 'Isolate voice + level'}</span>
          </button>
        </div>

        <div className="text-[11px] text-neutral-500 border-t border-neutral-800 pt-3">
          Offline neural TTS and voice cloning are unavailable in this build (no model bundled).
        </div>

        {status && <div className="text-[11px] text-neutral-400">{status}</div>}
      </div>
    </div>
  );
};
