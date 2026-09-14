import React from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { TimelineState } from '../types/timeline';
import { Video, Cpu, Palette, Volume2, Share2, Magnet } from 'lucide-react';

export const TopBar: React.FC = () => {
  const { activeWorkspace, setWorkspace, magneticSnapping, toggleMagneticSnapping, metadata } =
    useTimelineStore();

  const workspaces: { id: TimelineState['activeWorkspace']; label: string; icon: React.ReactNode }[] = [
    { id: 'edit', label: 'Edit & Cut', icon: <Video className="w-4 h-4 mr-1.5" /> },
    { id: 'ai', label: 'AI Copilot', icon: <Cpu className="w-4 h-4 mr-1.5 text-indigo-400" /> },
    { id: 'color', label: 'Color & Effects', icon: <Palette className="w-4 h-4 mr-1.5" /> },
    { id: 'audio', label: 'Audio Mastering', icon: <Volume2 className="w-4 h-4 mr-1.5" /> },
    { id: 'export', label: 'Export & Render', icon: <Share2 className="w-4 h-4 mr-1.5" /> },
  ];

  return (
    <header className="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between px-4 text-xs select-none text-neutral-300">
      {/* Left: App Title & File Menu */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 font-bold text-neutral-100 tracking-wider">
          <span className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-2 py-0.5 rounded text-[11px] font-black">
            CINECRAFT
          </span>
          <span className="text-neutral-400 font-normal">AI</span>
        </div>
        <nav className="flex space-x-3 text-neutral-400 hover:text-neutral-200 cursor-pointer">
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Clip</span>
          <span>Sequence</span>
          <span>Agent</span>
        </nav>
      </div>

      {/* Center: Workspaces Mode Switcher */}
      <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setWorkspace(ws.id)}
            className={`flex items-center px-3 py-1 rounded-md transition-all font-medium ${
              activeWorkspace === ws.id
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {ws.icon}
            {ws.label}
          </button>
        ))}
      </div>

      {/* Right: Project Info & Snapping Controls */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleMagneticSnapping}
          className={`flex items-center px-2 py-1 rounded border transition-colors ${
            magneticSnapping
              ? 'bg-indigo-950 border-indigo-600 text-indigo-300'
              : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'
          }`}
          title="Toggle Magnetic Snapping"
        >
          <Magnet className="w-3.5 h-3.5 mr-1" />
          <span>Snap</span>
        </button>
        <div className="text-right border-l border-neutral-800 pl-3">
          <div className="font-semibold text-neutral-200">{metadata.name}</div>
          <div className="text-[10px] text-neutral-500">
            {metadata.width}x{metadata.height} @ {metadata.fps}fps
          </div>
        </div>
      </div>
    </header>
  );
};
