import React, { useEffect, useState, useRef } from 'react';
import { ParametricEqView } from './ParametricEqView';
import { AudioMixer } from './AudioMixer';
import { useTimelineStore } from '../store/timelineStore';
import { audioEngine } from '../engine/audioEngine';

export const AudioWorkspace: React.FC = () => {
  const selectedClipIds = useTimelineStore((state) => state.selectedClipIds);
  const tracks = useTimelineStore((state) => state.tracks);
  const separateClipStems = useTimelineStore((state) => state.separateClipStems);
  const applyNoiseIsolation = useTimelineStore((state) => state.applyNoiseIsolation);

  // Sidechain Ducking UI State (Roadmap R17.2: -30dB threshold, -12dB depth, 50ms attack, 300ms release)
  const [duckingEnabled, setDuckingEnabled] = useState(true);
  const [thresholdDb, setThresholdDb] = useState(-30);
  const [depthDb, setDepthDb] = useState(-12);
  const [attackMs, setAttackMs] = useState(50);
  const [releaseMs, setReleaseMs] = useState(300);
  const [isDuckingActive, setIsDuckingActive] = useState(false);

  // Voice Isolation UI State (Roadmap R17.1 & R17.3)
  const [isolationStrength, setIsolationStrength] = useState(75);
  const [levelerEnabled, setLevelerEnabled] = useState(true);
  const [isProcessingIsolation, setIsProcessingIsolation] = useState(false);
  const [isProcessingStems, setIsProcessingStems] = useState(false);
  const [isolationStatus, setIsolationStatus] = useState<string | null>(null);
  const [stemsStatus, setStemsStatus] = useState<string | null>(null);

  // Poll real-time ducking activity LED from audio graph
  const animFrameRef = useRef<number>();
  useEffect(() => {
    const checkDucking = () => {
      const active = typeof audioEngine.isDuckingActive === 'function'
        ? audioEngine.isDuckingActive('dialogue', 'music')
        : false;
      setIsDuckingActive(active);
      animFrameRef.current = requestAnimationFrame(checkDucking);
    };
    animFrameRef.current = requestAnimationFrame(checkDucking);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Update audio graph ducking configuration on parameter change
  const handleThresholdChange = (val: number) => {
    setThresholdDb(val);
    const thresholdLinear = Math.pow(10, val / 20);
    audioEngine.updateDuckingConfig?.({ threshold: thresholdLinear });
  };

  const handleDepthChange = (val: number) => {
    setDepthDb(val);
    const duckingGainLinear = Math.pow(10, val / 20);
    audioEngine.updateDuckingConfig?.({ duckingGain: duckingGainLinear });
  };

  const handleAttackChange = (val: number) => {
    setAttackMs(val);
    audioEngine.updateDuckingConfig?.({ attack: val / 1000 });
  };

  const handleReleaseChange = (val: number) => {
    setReleaseMs(val);
    audioEngine.updateDuckingConfig?.({ release: val / 1000 });
  };

  const handleToggleDucking = () => {
    const next = !duckingEnabled;
    setDuckingEnabled(next);
    audioEngine.updateDuckingConfig?.({ enabled: next });
  };

  // Safely find selected clip even with incomplete store mocks
  const clipId = Array.isArray(selectedClipIds) && typeof selectedClipIds[0] === 'string'
    ? selectedClipIds[0]
    : null;

  const safeTracks = Array.isArray(tracks) ? tracks : [];
  const selectedClip = clipId
    ? safeTracks.flatMap((t) => (t && Array.isArray(t.clips) ? t.clips : [])).find((c) => c && c.id === clipId)
    : null;

  // Execute stem separation
  const handleSeparateStems = async () => {
    if (!selectedClip) return;
    setIsProcessingStems(true);
    setStemsStatus('Separating vocals and instrumental tracks...');
    try {
      const res = await separateClipStems(selectedClip.id);
      if (res) {
        setStemsStatus('✓ Stem separation complete: Vocals & Instrumental tracks added');
      } else {
        setStemsStatus('Stem separation finished');
      }
    } catch (err) {
      setStemsStatus(`Stem separation failed: ${(err as Error).message}`);
    } finally {
      setIsProcessingStems(false);
    }
  };

  // Execute voice isolation
  const handleVoiceIsolation = async () => {
    if (!selectedClip) return;
    setIsProcessingIsolation(true);
    setIsolationStatus('Running neural spectral noise suppression & AGC...');
    try {
      const res = await applyNoiseIsolation(selectedClip.id, isolationStrength / 100, levelerEnabled);
      if (res) {
        setIsolationStatus(`✓ Voice isolated! Measured SNR Improvement: +${res.snrImprovementDb.toFixed(1)} dB`);
      } else {
        setIsolationStatus('Noise isolation applied');
      }
    } catch (err) {
      setIsolationStatus(`Voice isolation failed: ${(err as Error).message}`);
    } finally {
      setIsProcessingIsolation(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 bg-neutral-950 min-h-0 text-neutral-200 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <h2 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
          <span>Audio Finishing Workspace</span>
          <span className="text-xs bg-indigo-900/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/50">
            Fairlight & Essential Sound DSP
          </span>
        </h2>
      </div>

      {/* AI Neural Audio Finishing & Sidechain Ducking Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Automated Sidechain Ducking Card (R17.2) */}
        <div
          data-testid="ducking-panel"
          className="bg-neutral-900/80 p-4 rounded-lg border border-neutral-800 shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50"></span>
                <h3 className="text-sm font-bold text-neutral-200">Automated Sidechain Ducking</h3>
              </div>
              <div className="flex items-center gap-2">
                {/* Active Ducking LED indicator */}
                <span
                  data-testid="ducking-active-badge"
                  className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold flex items-center gap-1 transition-all ${
                    isDuckingActive && duckingEnabled
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/20 animate-pulse'
                      : 'bg-neutral-800 text-neutral-500 border border-neutral-700/50'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isDuckingActive && duckingEnabled ? 'bg-emerald-400' : 'bg-neutral-600'
                    }`}
                  />
                  {isDuckingActive && duckingEnabled ? 'Ducking Active' : 'Standby'}
                </span>

                <button
                  data-testid="ducking-toggle"
                  onClick={handleToggleDucking}
                  className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${
                    duckingEnabled
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-400'
                  }`}
                >
                  {duckingEnabled ? 'Enabled' : 'Bypassed'}
                </button>
              </div>
            </div>

            <p className="text-xs text-neutral-400 mb-4">
              Dynamic bus detector automatically attenuates music track (<span className="text-cyan-400 font-mono">A2</span>)
              whenever dialogue (<span className="text-cyan-400 font-mono">A1</span>) exceeds threshold.
            </p>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Threshold */}
              <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800/80">
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Speech Threshold</span>
                  <span className="font-mono text-cyan-400">{thresholdDb} dB</span>
                </div>
                <input
                  data-testid="ducking-threshold"
                  type="range"
                  min="-45"
                  max="-10"
                  step="1"
                  value={thresholdDb}
                  onChange={(e) => handleThresholdChange(parseFloat(e.target.value))}
                  disabled={!duckingEnabled}
                  className="w-full accent-cyan-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Ducking Depth */}
              <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800/80">
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Music Attenuation</span>
                  <span className="font-mono text-cyan-400">{depthDb} dB</span>
                </div>
                <input
                  data-testid="ducking-depth"
                  type="range"
                  min="-24"
                  max="-6"
                  step="1"
                  value={depthDb}
                  onChange={(e) => handleDepthChange(parseFloat(e.target.value))}
                  disabled={!duckingEnabled}
                  className="w-full accent-cyan-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Attack */}
              <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800/80">
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Attack Time</span>
                  <span className="font-mono text-neutral-300">{attackMs} ms</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={attackMs}
                  onChange={(e) => handleAttackChange(parseFloat(e.target.value))}
                  disabled={!duckingEnabled}
                  className="w-full accent-cyan-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Release */}
              <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800/80">
                <div className="flex justify-between mb-1">
                  <span className="text-neutral-400">Release Time</span>
                  <span className="font-mono text-neutral-300">{releaseMs} ms</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="25"
                  value={releaseMs}
                  onChange={(e) => handleReleaseChange(parseFloat(e.target.value))}
                  disabled={!duckingEnabled}
                  className="w-full accent-cyan-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-neutral-800 text-[11px] text-neutral-500 flex justify-between">
            <span>Bus Routing: Dialogue (A1) ➔ Music (A2)</span>
            <span>Attack: 50ms | Release: 300ms</span>
          </div>
        </div>

        {/* AI Voice Isolation & Stem Separation Card (R17.1 & R17.3) */}
        <div
          data-testid="voice-isolation-panel"
          className="bg-neutral-900/80 p-4 rounded-lg border border-neutral-800 shadow-md flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50"></span>
                <h3 className="text-sm font-bold text-neutral-200">AI Voice Isolation & Stem Split</h3>
              </div>
              <span className="text-[11px] font-mono text-neutral-400 truncate max-w-[180px]">
                {selectedClip ? selectedClip.name : 'No Clip Selected'}
              </span>
            </div>

            <p className="text-xs text-neutral-400 mb-3">
              1-Click spectral noise suppression, dialogue leveling AGC (&gt;12dB SNR gain), and vocal/instrumental separation.
            </p>

            {/* Controls */}
            <div className="space-y-3">
              {/* Strength slider */}
              <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800/80">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-neutral-400">Isolation Strength</span>
                  <span className="font-mono text-indigo-400">{isolationStrength}%</span>
                </div>
                <input
                  data-testid="isolation-strength"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={isolationStrength}
                  onChange={(e) => setIsolationStrength(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* AGC Toggle */}
              <div className="flex items-center justify-between bg-neutral-950 p-2.5 rounded border border-neutral-800/80">
                <div>
                  <div className="text-xs font-semibold text-neutral-300">Automatic Dialogue Leveler (AGC)</div>
                  <div className="text-[11px] text-neutral-500">Smooths dynamic range to broadcast -20 dBFS</div>
                </div>
                <input
                  data-testid="leveler-toggle"
                  type="checkbox"
                  checked={levelerEnabled}
                  onChange={(e) => setLevelerEnabled(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  data-testid="isolate-voice-btn"
                  onClick={handleVoiceIsolation}
                  disabled={!selectedClip || isProcessingIsolation}
                  className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    !selectedClip
                      ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      : isProcessingIsolation
                      ? 'bg-indigo-700/60 text-indigo-200 cursor-wait'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  }`}
                >
                  {isProcessingIsolation ? 'Isolating Dialogue...' : '1-Click Isolate Dialogue'}
                </button>

                <button
                  data-testid="separate-stems-btn"
                  onClick={handleSeparateStems}
                  disabled={!selectedClip || isProcessingStems}
                  className={`flex-1 py-2 px-3 rounded text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    !selectedClip
                      ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                      : isProcessingStems
                      ? 'bg-purple-700/60 text-purple-200 cursor-wait'
                      : 'bg-purple-600 hover:bg-purple-500 text-white shadow-sm'
                  }`}
                >
                  {isProcessingStems ? 'Splitting Stems...' : 'Separate Stems (Vocal/Music)'}
                </button>
              </div>

              {/* Status alerts */}
              {isolationStatus && (
                <div className="text-[11px] text-indigo-300 bg-indigo-950/60 border border-indigo-800/50 px-2.5 py-1.5 rounded">
                  {isolationStatus}
                </div>
              )}
              {stemsStatus && (
                <div className="text-[11px] text-purple-300 bg-purple-950/60 border border-purple-800/50 px-2.5 py-1.5 rounded">
                  {stemsStatus}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-neutral-800 text-[11px] text-neutral-500 flex justify-between">
            <span>Alg: Spectral Subtraction + AGC</span>
            <span className="text-emerald-400 font-mono">Target SNR: &gt;12dB</span>
          </div>
        </div>
      </div>

      <div className="flex space-x-6">
        <div className="flex-1 space-y-4">
          <ParametricEqView />
          <AudioMixer />
        </div>

        <div className="w-24 bg-neutral-900 p-4 rounded-md border border-neutral-800 flex flex-col items-center opacity-50">
          <h3 className="text-sm font-semibold mb-4 text-neutral-300 text-center">
            Master<br />LUFS
          </h3>
          <div className="w-4 h-64 bg-neutral-950 rounded-full flex items-end justify-center overflow-hidden border border-neutral-700 relative">
            <div className="text-neutral-500 text-[10px] transform -rotate-90 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              DISABLED
            </div>
          </div>
          <div className="text-[10px] mt-2 text-neutral-500">DISABLED</div>
        </div>
      </div>
    </div>
  );
};
