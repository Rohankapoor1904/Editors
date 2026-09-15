import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { TimelineState } from '../types/timeline';
import { Video, Sparkles, Palette, Volume2, Share2, Magnet, Cpu, Zap, Download } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { activeWorkspace, setWorkspace, magneticSnapping, toggleMagneticSnapping, metadata } =
    useTimelineStore();

  const workspaces: { id: TimelineState['activeWorkspace']; label: string; icon: React.ReactNode }[] = [
    { id: 'edit', label: 'Edit & Cut', icon: <Video className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'ai', label: 'AI Copilot', icon: <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-400 animate-pulse shrink-0" /> },
    { id: 'color', label: 'Color & FX', icon: <Palette className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'export', label: 'Export', icon: <Share2 className="w-3.5 h-3.5 mr-1 shrink-0" /> },
  ];

  return (
    <header className="h-11 bg-neutral-950/90 backdrop-blur border-b border-neutral-800/80 flex items-center justify-between px-3 text-xs select-none text-neutral-300 z-30">
      {/* Left: App Logo & Menu */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 font-bold text-neutral-100 tracking-wider">
          <div className="bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-1 rounded-md shadow-lg shadow-indigo-500/20">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-extrabold bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent text-sm">
            CINECRAFT<span className="text-indigo-400 font-mono text-xs ml-1 font-semibold">PRO</span>
          </span>
        </div>

        <div className="h-4 w-[1px] bg-neutral-800" />

        <nav className="hidden md:flex items-center space-x-3 text-neutral-400 text-[11px] font-medium">
          {['File', 'Edit', 'View', 'Clip', 'Sequence', 'Effects', 'Help'].map((item) => (
            <span
              key={item}
              className="hover:text-neutral-100 cursor-pointer transition-colors px-1 py-0.5 rounded hover:bg-neutral-800/50"
            >
              {item}
            </span>
          ))}
        </nav>
      </div>

      {/* Center: Workspaces Mode Switcher */}
      <div className="hidden lg:flex items-center bg-neutral-900/90 p-0.5 rounded-lg border border-neutral-800/80 shadow-inner whitespace-nowrap shrink-0">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setWorkspace(ws.id)}
            className={`flex items-center px-2 py-0.5 rounded-md transition-all text-[11px] font-medium whitespace-nowrap shrink-0 ${
              activeWorkspace === ws.id
                ? 'bg-neutral-800 text-white shadow border border-neutral-700/60'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/30'
            }`}
          >
            {ws.icon}
            <span className="whitespace-nowrap">{ws.label}</span>
          </button>
        ))}
      </div>

      {/* Right: GPU Accelerator, Project Info & Export CTA */}
      <div className="flex items-center space-x-2.5">
        <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-emerald-400 font-mono">
          <Cpu className="w-3 h-3 text-emerald-400" />
          <span>WebGPU Accel</span>
        </div>

        <button
          onClick={toggleMagneticSnapping}
          className={`flex items-center px-2 py-1 rounded text-[11px] font-medium border transition-all ${
            magneticSnapping
              ? 'bg-indigo-950/80 border-indigo-600/80 text-indigo-300 shadow-sm shadow-indigo-900/30'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="Toggle Magnetic Snapping (S)"
        >
          <Magnet className={`w-3 h-3 mr-1 ${magneticSnapping ? 'text-indigo-400' : 'text-neutral-400'}`} />
          <span>Snap</span>
        </button>

        <div className="h-4 w-[1px] bg-neutral-800" />

        <div className="text-right hidden sm:block">
          <div className="font-semibold text-neutral-200 text-[11px] leading-tight truncate max-w-[120px]">
            {metadata.name}
          </div>
          <div className="text-[9px] text-neutral-500 font-mono">
            {metadata.width}x{metadata.height} • {metadata.fps}fps
          </div>
        </div>

        <button
          onClick={() => setWorkspace('export')}
          className="flex items-center space-x-1.5 px-3 py-1 rounded-md bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-[11px] shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
