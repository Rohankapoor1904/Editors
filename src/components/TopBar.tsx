import React, { useEffect, useState } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { TimelineState } from '../types/timeline';
import { Video, Sparkles, Palette, Volume2, Share2, Magnet, Cpu, Zap, Download, ShieldAlert, FlaskConical } from 'lucide-react';
import { getRuntimeMode, setRuntimeMode, subscribeRuntimeMode, RuntimeMode } from '../services/runtimeConfig';

export const TopBar: React.FC = () => {
  const { activeWorkspace, setWorkspace, magneticSnapping, toggleMagneticSnapping, metadata } =
    useTimelineStore();
  const [runtimeMode, setMode] = useState<RuntimeMode>(getRuntimeMode());

  useEffect(() => {
    return subscribeRuntimeMode((newMode) => {
      setMode(newMode);
    });
  }, []);

  const toggleRuntimeMode = () => {
    setRuntimeMode(runtimeMode === 'live' ? 'demo' : 'live');
  };

  const workspaces: { id: TimelineState['activeWorkspace']; label: string; icon: React.ReactNode }[] = [
    { id: 'edit', label: 'Edit & Cut', icon: <Video className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'ai', label: 'AI Copilot', icon: <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-accent animate-pulse shrink-0" /> },
    { id: 'color', label: 'Color & FX', icon: <Palette className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'export', label: 'Export', icon: <Share2 className="w-3.5 h-3.5 mr-1 shrink-0" /> },
  ];

  return (
    <header className="h-11 bg-dark-950/90 backdrop-blur border-b border-subtle flex items-center justify-between px-3 text-xs select-none text-neutral-300 z-30 shrink-0">
      {/* Left: App Logo & Menu */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="flex items-center space-x-2 font-bold text-neutral-100 tracking-wider">
          <div className="bg-gradient-to-tr from-indigo-accent via-purple-600 to-teal-accent p-1 rounded-md shadow-lg shadow-indigo-500/20">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-extrabold bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent text-sm">
            CINECRAFT<span className="text-indigo-accent font-mono text-xs ml-1 font-semibold">PRO</span>
          </span>
        </div>

        <div className="h-4 w-[1px] bg-neutral-800" />

        <nav className="hidden xl:flex items-center space-x-2.5 text-neutral-400 text-[11px] font-medium relative">
          <div className="relative group">
            <span className="hover:text-neutral-100 cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-dark-800">
              File
            </span>
            <div className="absolute left-0 top-full mt-1 w-40 bg-dark-900 border border-neutral-800 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button
                onClick={() => import('../core/project/io').then(io => io.handleSaveProject())}
                className="w-full text-left px-4 py-2 hover:bg-dark-800 text-neutral-300 hover:text-white transition-colors"
              >
                Save Project
              </button>
              <button
                onClick={() => import('../core/project/io').then(io => io.handleLoadProject())}
                className="w-full text-left px-4 py-2 hover:bg-dark-800 text-neutral-300 hover:text-white transition-colors"
              >
                Load Project
              </button>
            </div>
          </div>
          {['Edit', 'View', 'Clip', 'Sequence', 'Effects', 'Help'].map((item) => (
            <span
              key={item}
              className="hover:text-neutral-100 cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-dark-800"
            >
              {item}
            </span>
          ))}
        </nav>
      </div>

      {/* Center: Workspaces Mode Switcher */}
      <div className="hidden md:flex items-center bg-dark-900 p-0.5 rounded-panel border border-subtle shadow-inner whitespace-nowrap shrink-0">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setWorkspace(ws.id)}
            className={`flex items-center px-2 py-0.5 rounded-md transition-all text-[11px] font-medium whitespace-nowrap shrink-0 ${
              activeWorkspace === ws.id
                ? 'bg-dark-800 text-white shadow border border-neutral-700/60'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-dark-850'
            }`}
          >
            {ws.icon}
            <span className="whitespace-nowrap">{ws.label}</span>
          </button>
        ))}
      </div>

      {/* Right: Runtime Mode Indicator, GPU Accelerator, Project Info & Export CTA */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Runtime Mode Selector Pill */}
        <button
          onClick={toggleRuntimeMode}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded-panel border text-[10px] font-mono font-semibold transition-all cursor-pointer select-none shrink-0 ${
            runtimeMode === 'live'
              ? 'bg-emerald-950/70 border-emerald-500/60 text-emerald-300 hover:bg-emerald-900/80 shadow-sm shadow-emerald-950/50'
              : 'bg-purple-950/70 border-purple-500/60 text-purple-300 hover:bg-purple-900/80 shadow-sm shadow-purple-950/50'
          }`}
          title={`Click to switch runtime mode. Currently in ${runtimeMode.toUpperCase()} mode.`}
        >
          {runtimeMode === 'live' ? (
            <>
              <ShieldAlert className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>MODE: LIVE</span>
            </>
          ) : (
            <>
              <FlaskConical className="w-3 h-3 text-purple-400 shrink-0" />
              <span>MODE: DEMO</span>
            </>
          )}
        </button>

        <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded-panel bg-dark-900 border border-subtle text-[10px] text-teal-accent font-mono shrink-0">
          <Cpu className="w-3 h-3 text-teal-accent" />
          <span>WebGPU Accel</span>
        </div>

        <button
          onClick={toggleMagneticSnapping}
          className={`flex items-center px-2 py-1 rounded-panel text-[11px] font-medium border transition-all shrink-0 ${
            magneticSnapping
              ? 'bg-indigo-950/80 border-indigo-500/80 text-indigo-300 shadow-sm shadow-indigo-900/30'
              : 'bg-dark-900 border-subtle text-neutral-400 hover:text-neutral-200'
          }`}
          title="Toggle Magnetic Snapping (S)"
        >
          <Magnet className={`w-3 h-3 mr-1 ${magneticSnapping ? 'text-indigo-400' : 'text-neutral-400'}`} />
          <span>Snap</span>
        </button>

        <div className="h-4 w-[1px] bg-neutral-800 hidden sm:block" />

        <div className="text-right hidden sm:block truncate max-w-[110px]">
          <div className="font-semibold text-neutral-200 text-[11px] leading-tight truncate">
            {metadata.name}
          </div>
          <div className="text-[9px] text-neutral-500 font-mono tabular-nums">
            {metadata.width}x{metadata.height} • {metadata.fps}fps
          </div>
        </div>

        <button
          onClick={() => setWorkspace('export')}
          className="flex items-center space-x-1.5 px-3 py-1 rounded-panel bg-gradient-to-r from-indigo-accent to-purple-600 hover:from-indigo-hover hover:to-purple-700 text-white font-medium text-[11px] shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02] shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
