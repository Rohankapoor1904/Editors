import React, { useEffect, useState, useRef } from 'react';
import { useTimelineStore } from '../store/timelineStore';
import { TimelineState } from '../types/timeline';
import { Video, Sparkles, Palette, Volume2, Share2, Magnet, Zap, Download, Bot } from 'lucide-react';
import { saveProjectNative, openProjectNative } from '../services/projectPersistence';
import { useMediaPoolStore } from '../store/mediaPool';

export const TopBar: React.FC = () => {
  const { assets: mediaPoolAssets } = useMediaPoolStore();
  const {
    activeWorkspace, setWorkspace,
    magneticSnapping, toggleMagneticSnapping,
    metadata,
    undo, redo, splitClip, selectedClipIds, playheadPosition,
    setZoomLevel, zoomLevel, addTrack, toggleClipMute, removeClip
  } = useTimelineStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menus = React.useMemo<Record<string, { label?: string; action?: () => void; divider?: boolean }[]>>(() => ({
    File: [
      { label: 'Save Project', action: async () => {
        const state = useTimelineStore.getState();
        try {
          await saveProjectNative(state, mediaPoolAssets);
        } catch (err) {
          console.error('Failed to save project', err);
          alert('Failed to save project.');
        }
      } },
      { label: 'Open Project', action: async () => {
        try {
          await openProjectNative();
        } catch (err) {
          console.error('Failed to open project', err);
          alert('Failed to open project file: Invalid format');
        }
      } },
      { divider: true },
      { label: 'Export...', action: () => setWorkspace('export') },
    ],
    Edit: [
      { label: 'Undo', action: () => undo() },
      { label: 'Redo', action: () => redo() },
      { divider: true },
      { label: 'Split at Playhead', action: () => {
        if (selectedClipIds.length > 0) {
          splitClip(selectedClipIds[0], playheadPosition);
        }
      } },
    ],
    View: [
      { label: 'Zoom In', action: () => setZoomLevel(zoomLevel + 5) },
      { label: 'Zoom Out', action: () => setZoomLevel(zoomLevel - 5) },
      { label: 'Reset Zoom', action: () => setZoomLevel(20) },
      { divider: true },
      { label: 'Toggle Snapping', action: () => toggleMagneticSnapping() },
    ],
    Clip: [
      { label: 'Split Clip at Playhead', action: () => {
        if (selectedClipIds.length > 0) {
          splitClip(selectedClipIds[0], playheadPosition);
        }
      } },
      { label: 'Mute / Unmute Clip', action: () => {
        if (selectedClipIds.length > 0) {
          toggleClipMute(selectedClipIds[0]);
        }
      } },
      { label: 'Delete Selected Clip', action: () => {
        if (selectedClipIds.length > 0) {
          removeClip(selectedClipIds[0]);
        }
      } },
    ],
    Sequence: [
      { label: 'Add Video Track', action: () => addTrack('video') },
      { label: 'Add Audio Track', action: () => addTrack('audio') },
    ],
    Effects: [
      { label: 'Color Workspace & 3D LUT', action: () => setWorkspace('color') },
      { label: 'Audio DSP & Parametric EQ', action: () => setWorkspace('audio') },
      { label: 'AI Copilot & Transcription', action: () => setWorkspace('ai') },
      { divider: true },
      { label: 'Standard Edit Workspace', action: () => setWorkspace('edit') },
    ],
    Help: [
      { label: 'Keyboard Shortcuts', action: () => {
        alert("CineCraft Shortcuts:\n• Space: Play / Pause\n• S: Split Clip at Playhead\n• M: Toggle Clip Mute\n• Backspace / Del: Delete Clip\n• Cmd/Ctrl + Z: Undo\n• Cmd/Ctrl + Shift + Z: Redo\n• Snap toggle: S key");
      } },
      { divider: true },
      { label: 'About CineCraft AI Studio', action: () => {
        alert("CineCraft AI Studio v1.0.0\nProfessional AI-Native Desktop Video Editor\nBuilt on WebGPU + React 18 + Tauri 2.0");
      } },
    ]
  }), [undo, redo, splitClip, selectedClipIds, playheadPosition, setZoomLevel, zoomLevel, toggleMagneticSnapping, addTrack, setWorkspace, toggleClipMute, removeClip]);

  const workspaces: { id: TimelineState['activeWorkspace']; label: string; icon: React.ReactNode }[] = [
    { id: 'edit', label: 'Edit & Cut', icon: <Video className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'ai', label: 'AI Copilot', icon: <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-accent animate-pulse shrink-0" /> },
    { id: 'color', label: 'Color & FX', icon: <Palette className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'audio', label: 'Audio', icon: <Volume2 className="w-3.5 h-3.5 mr-1 shrink-0" /> },
    { id: 'export', label: 'Export', icon: <Share2 className="w-3.5 h-3.5 mr-1 shrink-0" /> },
  ];

  return (
    <header className="relative z-50 h-11 bg-[#090a0f]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between px-3 text-xs select-none text-neutral-300 shrink-0 shadow-sm">
      {/* Left: App Logo & Menu */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="flex items-center space-x-2 font-bold text-neutral-100 tracking-wider group cursor-pointer">
          <div className="bg-gradient-to-tr from-indigo-500 via-purple-500 to-teal-400 p-1 rounded-lg shadow-[0_0_16px_rgba(99,102,241,0.35)] group-hover:scale-105 transition-transform duration-200">
            <Zap className="w-3.5 h-3.5 text-white fill-white" />
          </div>
          <span className="font-extrabold bg-gradient-to-r from-white via-neutral-100 to-neutral-400 bg-clip-text text-transparent text-sm tracking-tight">
            CINECRAFT<span className="text-indigo-400 font-mono text-[10px] ml-1.5 px-1.5 py-0.5 rounded bg-indigo-950/70 border border-indigo-500/40 font-semibold tracking-wider">PRO</span>
          </span>
        </div>

        <div className="h-4 w-[1px] bg-neutral-800" />

        <nav ref={menuRef} className="hidden xl:flex items-center space-x-1 text-neutral-400 text-[11px] font-medium relative">
          {Object.entries(menus).map(([menuName, menuItems]: [string, any[]]) => (
            <div key={menuName} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === menuName ? null : menuName)}
                className={`hover:text-neutral-100 cursor-pointer transition-all px-2.5 py-1 rounded-md text-[11px] ${
                  openMenu === menuName ? 'bg-white/10 text-neutral-100 shadow-sm' : 'hover:bg-white/[0.06]'
                }`}
              >
                {menuName}
              </button>

              {openMenu === menuName && menuItems.length > 0 && (
                <div className="absolute top-full left-0 mt-1.5 w-52 bg-[#12141c]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_12px_36px_rgba(0,0,0,0.6)] py-1.5 z-[100] animate-in fade-in zoom-in-95 duration-100">
                  {menuItems.map((item, idx) =>
                    item.divider ? (
                      <div key={idx} className="h-px bg-white/[0.08] my-1" />
                    ) : (
                      <button
                        key={idx}
                        onClick={() => {
                          item.action?.();
                          setOpenMenu(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-indigo-600 hover:text-white transition-colors text-neutral-200 text-xs flex items-center justify-between group rounded-md mx-auto"
                      >
                        <span>{item.label}</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Center: Workspaces Mode Switcher */}
      <div className="hidden md:flex items-center bg-[#10121a] p-0.5 rounded-lg border border-white/[0.08] shadow-inner whitespace-nowrap shrink-0">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setWorkspace(ws.id)}
            className={`flex items-center px-2.5 py-1 rounded-md transition-all text-[11px] font-medium whitespace-nowrap shrink-0 ${
              activeWorkspace === ws.id
                ? 'bg-gradient-to-b from-[#222533] to-[#161822] text-white shadow-[0_1px_3px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-indigo-500/30'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.04]'
            }`}
          >
            {ws.icon}
            <span className="whitespace-nowrap">{ws.label}</span>
          </button>
        ))}
      </div>

      {/* Right: Snapping, Project Info & Export CTA */}
      <div className="flex items-center space-x-2 shrink-0">
        <div
          className="hidden lg:flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono shadow-[0_0_10px_rgba(16,185,129,0.15)]"
          title="AI Agent Live Control Bridge Active (/api/agent)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <Bot className="w-3 h-3 text-emerald-400" />
          <span className="font-semibold tracking-wider">AI BRIDGE</span>
        </div>

        <button
          onClick={toggleMagneticSnapping}
          className={`flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all shrink-0 ${
            magneticSnapping
              ? 'bg-cyan-950/70 border-cyan-500/70 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
              : 'bg-[#10121a] border-white/[0.08] text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.05]'
          }`}
          title="Toggle Magnetic Snapping (S)"
        >
          <Magnet className={`w-3 h-3 mr-1 ${magneticSnapping ? 'text-cyan-400' : 'text-neutral-400'}`} />
          <span>Snap</span>
        </button>

        <div className="h-4 w-[1px] bg-neutral-800 hidden sm:block" />

        <div className="text-right hidden sm:block truncate max-w-[120px]">
          <div className="font-semibold text-neutral-200 text-[11px] leading-tight truncate">
            {metadata.name}
          </div>
          <div className="text-[9px] text-neutral-500 font-mono tabular-nums">
            {metadata.width}x{metadata.height} • {metadata.fps}fps
          </div>
        </div>

        <button
          onClick={() => setWorkspace('export')}
          className="flex items-center space-x-1.5 px-3.5 py-1 rounded-lg bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium text-[11px] shadow-[0_0_16px_rgba(99,102,241,0.35)] transition-all hover:scale-[1.02] shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
