import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Sparkles, RefreshCw, Layers, CheckCircle2, Volume2 } from 'lucide-react';
import { useTimelineStore } from '../store/timelineStore';
import { SwitchMultiCamAngleCommand, SyncClipsCommand } from '../core/commands/multicam';
import { multicamSyncEngine } from '../engine/multicam/multicamSync';
import { multiCamAutoSwitchEngine, MultiCamAngleProfile } from '../engine/multicam/autoSwitch';

export interface MultiCamAngle {
  id: string;
  name: string;
  assetId: string;
  label: string;
  shortcut: string;
  resolution: string;
}

export interface MultiCamViewerProps {
  onClose?: () => void;
  className?: string;
}

const DEFAULT_ANGLES: MultiCamAngle[] = [
  { id: 'angle_1', name: 'Host Close-Up (Cam A)', assetId: 'asset_cam_a', label: 'ANGLE 1', shortcut: '1', resolution: '4K 60fps' },
  { id: 'angle_2', name: 'Guest Close-Up (Cam B)', assetId: 'asset_cam_b', label: 'ANGLE 2', shortcut: '2', resolution: '4K 60fps' },
  { id: 'angle_3', name: 'Wide Studio (Cam C)', assetId: 'asset_cam_c', label: 'ANGLE 3 [WIDE]', shortcut: '3', resolution: '4K 30fps' },
  { id: 'angle_4', name: 'Overhead / B-Roll (Cam D)', assetId: 'asset_cam_d', label: 'ANGLE 4', shortcut: '4', resolution: '1080p 60fps' },
];

export const MultiCamViewer: React.FC<MultiCamViewerProps> = ({ onClose, className = '' }) => {
  const [activeAngleIndex, setActiveAngleIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isAutoCutting, setIsAutoCutting] = useState(false);
  const [autoCutStatus, setAutoCutStatus] = useState<string | null>(null);

  const { tracks, playheadPosition, executeCommand } = useTimelineStore();
  const videoTrack = tracks.find((t) => t.type === 'video');
  const activeClip = videoTrack?.clips[0];

  const switchAngle = useCallback((index: number) => {
    if (index < 0 || index >= DEFAULT_ANGLES.length) return;
    setActiveAngleIndex(index);

    const angle = DEFAULT_ANGLES[index];
    if (activeClip) {
      executeCommand(
        new SwitchMultiCamAngleCommand(
          activeClip.id,
          playheadPosition,
          index,
          angle.assetId,
          angle.name
        )
      );
    }
  }, [activeClip, playheadPosition, executeCommand]);

  // Keyboard shortcut listener for live angle switching (1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when inside input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      if (e.key === '1') switchAngle(0);
      else if (e.key === '2') switchAngle(1);
      else if (e.key === '3') switchAngle(2);
      else if (e.key === '4') switchAngle(3);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [switchAngle]);

  const handleWaveformSync = () => {
    setIsSyncing(true);
    setSyncStatus('Analyzing audio cross-correlation...');

    setTimeout(() => {
      // Generate synthetic speech envelope test signals for Cam A and Cam B with 1.2s delay
      const sampleRate = 48000;
      const refSignal = new Float32Array(sampleRate * 5);
      const targetSignal = new Float32Array(sampleRate * 5);

      // Add speech envelope peaks
      for (let i = 0; i < sampleRate; i++) {
        refSignal[sampleRate + i] = Math.sin(i * 0.05) * 0.8;
        targetSignal[Math.floor(sampleRate * 2.2) + i] = Math.sin(i * 0.05) * 0.8;
      }

      const syncResult = multicamSyncEngine.syncAudioWaveforms(refSignal, targetSignal, sampleRate);

      if (activeClip) {
        executeCommand(new SyncClipsCommand(activeClip.id, syncResult.offsetRational));
      }

      setIsSyncing(false);
      setSyncStatus(`Aligned! Audio sync offset: ${syncResult.offsetSeconds.toFixed(3)}s (confidence ${(syncResult.confidence * 100).toFixed(0)}%)`);
    }, 400);
  };

  const handleAutoCut = () => {
    setIsAutoCutting(true);
    setAutoCutStatus('Evaluating active speaker turns & energy...');

    setTimeout(() => {
      const sampleRate = 48000;
      const durationSec = 12;

      // Host talks 0-4s, Guest talks 4-8s, Pause 8-12s
      const hostSignal = new Float32Array(sampleRate * durationSec);
      const guestSignal = new Float32Array(sampleRate * durationSec);
      const wideSignal = new Float32Array(sampleRate * durationSec);

      for (let i = 0; i < sampleRate * 4; i++) hostSignal[i] = 0.5;
      for (let i = sampleRate * 4; i < sampleRate * 8; i++) guestSignal[i] = 0.6;
      for (let i = 0; i < sampleRate * durationSec; i++) wideSignal[i] = 0.1;

      const angleProfiles: MultiCamAngleProfile[] = [
        { angleIndex: 0, name: DEFAULT_ANGLES[0].name, assetId: DEFAULT_ANGLES[0].assetId, audioSignal: hostSignal },
        { angleIndex: 1, name: DEFAULT_ANGLES[1].name, assetId: DEFAULT_ANGLES[1].assetId, audioSignal: guestSignal },
        { angleIndex: 2, name: DEFAULT_ANGLES[2].name, assetId: DEFAULT_ANGLES[2].assetId, audioSignal: wideSignal },
      ];

      const decisions = multiCamAutoSwitchEngine.generateAutoCuts(angleProfiles, durationSec, {
        minShotDurationSec: 2.0,
        wideAngleIndex: 2,
      });

      // Apply cuts sequentially
      if (activeClip) {
        for (const decision of decisions) {
          if (decision.timestampSeconds > 0) {
            executeCommand(
              new SwitchMultiCamAngleCommand(
                activeClip.id,
                decision.timestampRational,
                decision.angleIndex,
                decision.assetId,
                decision.angleName
              )
            );
          }
        }
      }

      setIsAutoCutting(false);
      setAutoCutStatus(`Generated ${decisions.length} automated speaker cuts across sequence.`);
    }, 450);
  };

  return (
    <div className={`flex flex-col h-full w-full bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-900 border-b border-neutral-800 text-xs">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-neutral-100 uppercase tracking-wider">Multi-Cam Quad Monitor</span>
          <span className="px-1.5 py-0.5 text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 rounded">
            4-UP LIVE
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleWaveformSync}
            disabled={isSyncing}
            className="flex items-center space-x-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] font-medium border border-neutral-700 transition"
            title="Auto-synchronize angle clips via audio waveform correlation"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-400' : 'text-neutral-400'}`} />
            <span>{isSyncing ? 'Syncing...' : 'Auto-Sync Audio'}</span>
          </button>

          <button
            onClick={handleAutoCut}
            disabled={isAutoCutting}
            className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-200 rounded text-[11px] font-medium border border-emerald-700 transition"
            title="AI Active Speaker Auto-Cut Switching"
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            <span>{isAutoCutting ? 'Cutting...' : 'AI Auto-Cut'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] font-medium border border-neutral-700 transition"
            >
              Single View
            </button>
          )}
        </div>
      </div>

      {/* Status banner */}
      {(syncStatus || autoCutStatus) && (
        <div className="px-3 py-1.5 bg-neutral-900/80 border-b border-neutral-800 text-[11px] text-emerald-300 flex items-center space-x-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>{syncStatus || autoCutStatus}</span>
        </div>
      )}

      {/* 2x2 Quad Angle Grid */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-1.5 p-2 bg-neutral-950">
        {DEFAULT_ANGLES.map((angle, idx) => {
          const isActive = activeAngleIndex === idx;
          return (
            <div
              key={angle.id}
              onClick={() => switchAngle(idx)}
              className={`relative flex flex-col justify-between p-2 rounded cursor-pointer transition border ${
                isActive
                  ? 'border-emerald-500 bg-neutral-900 ring-2 ring-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                  : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-700'
              }`}
            >
              {/* Top Angle Tag & Hotkey Badge */}
              <div className="flex items-center justify-between z-10">
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      isActive ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    {angle.label}
                  </span>
                  <span className="text-[11px] text-neutral-300 font-medium truncate max-w-[140px]">
                    {angle.name}
                  </span>
                </div>

                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-neutral-800 text-neutral-400 rounded border border-neutral-700">
                  [{angle.shortcut}]
                </span>
              </div>

              {/* Simulated Camera Feed Surface */}
              <div className="flex-1 flex items-center justify-center my-2 relative">
                <Camera className={`w-8 h-8 ${isActive ? 'text-emerald-400' : 'text-neutral-600'}`} />
                {isActive && (
                  <div className="absolute top-1 right-1 flex items-center space-x-1 px-1.5 py-0.5 bg-red-950/80 text-red-300 border border-red-800 text-[9px] font-bold rounded animate-pulse">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                    <span>ON AIR</span>
                  </div>
                )}
              </div>

              {/* Bottom Info Bar */}
              <div className="flex items-center justify-between text-[10px] text-neutral-400 z-10 pt-1 border-t border-neutral-800/80">
                <span className="font-mono">{angle.resolution}</span>
                <div className="flex items-center space-x-1">
                  <Volume2 className="w-3 h-3 text-neutral-400" />
                  <span>CH 1/2</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
