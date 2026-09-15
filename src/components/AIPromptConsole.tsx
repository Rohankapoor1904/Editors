import React, { useState } from 'react';
import { Sparkles, Send, Bot, Terminal, Sliders, Scissors, Captions, VolumeX, Palette, Wand2 } from 'lucide-react';
import { agentOrchestrator, AgentStepLog } from '../services/agentOrchestrator';

export const AIPromptConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'copilot' | 'inspector'>('copilot');
  const [prompt, setPrompt] = useState('');
  const [agentLogs, setAgentLogs] = useState<AgentStepLog[]>([
    { type: 'thought', message: 'System initialized ReAct AI Agent Orchestrator.' },
    { type: 'tool', message: 'Loaded tools: probe_media, transcribe_and_align, detect_silence, cut_and_arrange_timeline.' },
  ]);

  const quickPresets = [
    { label: '⚡ Cut Silences >0.5s', prompt: 'Detect all silence pauses greater than 0.5 seconds and cut them from timeline', icon: <Scissors className="w-3 h-3 text-amber-400" /> },
    { label: '🎯 Auto Subtitles', prompt: 'Transcribe dialogue audio with Whisper AI and generate animated subtitles', icon: <Captions className="w-3 h-3 text-indigo-400" /> },
    { label: '🎵 Denoise Audio', prompt: 'Apply spectral noise suppression and speech isolation on audio tracks', icon: <VolumeX className="w-3 h-3 text-emerald-400" /> },
    { label: '🎨 Color Match', prompt: 'Auto-grade color and match contrast across all video clips', icon: <Palette className="w-3 h-3 text-purple-400" /> },
  ];

  const handleRunCommand = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const cmdToRun = customPrompt || prompt;
    if (!cmdToRun.trim()) return;

    setPrompt('');

    await agentOrchestrator.processPrompt(cmdToRun, (log) => {
      setAgentLogs((prev) => [...prev, log]);
    });
  };

  return (
    <div className="w-88 bg-neutral-900 border-l border-neutral-800/80 flex flex-col h-full select-none text-xs">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-800/80 px-2 py-2 bg-neutral-950/40">
        <div className="flex space-x-1 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800/80 w-full">
          <button
            onClick={() => setActiveTab('copilot')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-md font-medium text-[11px] transition-all ${
              activeTab === 'copilot'
                ? 'bg-neutral-800 text-white shadow border border-neutral-700/60'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Copilot</span>
          </button>

          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-md font-medium text-[11px] transition-all ${
              activeTab === 'inspector'
                ? 'bg-neutral-800 text-white shadow border border-neutral-700/60'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-purple-400" />
            <span>Inspector</span>
          </button>
        </div>
      </div>

      {activeTab === 'copilot' ? (
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* Quick AI Presets Header */}
          <div className="p-2.5 border-b border-neutral-800/80 bg-neutral-950/20">
            <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2 flex items-center justify-between">
              <span>Quick AI Actions</span>
              <Wand2 className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {quickPresets.map((preset, i) => (
                <button
                  key={i}
                  onClick={() => handleRunCommand(undefined, preset.prompt)}
                  className="flex items-center space-x-1.5 p-1.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800/80 hover:border-indigo-500/60 rounded-md text-[10px] text-neutral-300 transition-all text-left group"
                >
                  {preset.icon}
                  <span className="truncate group-hover:text-white font-medium">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Agent Activity / Log Monitor */}
          <div className="flex-1 bg-neutral-950 p-3 overflow-y-auto font-mono text-[11px] text-neutral-400 space-y-2 border-b border-neutral-800/80">
            <div className="flex items-center space-x-1.5 text-indigo-400 font-sans font-semibold mb-2">
              <Terminal className="w-3.5 h-3.5" />
              <span>Execution Output Log</span>
            </div>
            {agentLogs.map((log, idx) => (
              <div
                key={idx}
                className={`p-2 rounded-lg border leading-relaxed ${
                  log.type === 'user'
                    ? 'bg-indigo-950/40 border-indigo-800/50 text-indigo-200 font-sans'
                    : log.type === 'tool'
                    ? 'bg-neutral-900 border-neutral-800 text-emerald-400'
                    : log.type === 'response'
                    ? 'bg-purple-950/40 border-purple-800/50 text-purple-200 font-semibold font-sans'
                    : 'text-neutral-500 border-transparent'
                }`}
              >
                {log.type === 'user' ? `> User Prompt: "${log.message}"` : log.message}
              </div>
            ))}
          </div>

          {/* Prompt Form */}
          <form onSubmit={handleRunCommand} className="p-2.5 bg-neutral-900">
            <div className="relative flex items-center">
              <Bot className="w-4 h-4 absolute left-3 text-indigo-400" />
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask AI Copilot to edit, trim, or color..."
                className="w-full bg-neutral-950 text-neutral-200 text-xs pl-9 pr-9 py-2 rounded-lg border border-neutral-800 focus:outline-none focus:border-indigo-500/80 placeholder-neutral-500 shadow-inner"
              />
              <button
                type="submit"
                className="absolute right-1.5 p-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-md shadow-sm transition-all"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Clip Properties Inspector Tab */
        <div className="flex-1 p-3 overflow-y-auto space-y-4 bg-neutral-950 text-neutral-300">
          <div>
            <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2">
              Transform Controls
            </div>
            <div className="space-y-2 bg-neutral-900 p-2.5 rounded-lg border border-neutral-800/80 text-xs">
              <div className="flex justify-between items-center">
                <span>Scale</span>
                <span className="font-mono text-indigo-400">100%</span>
              </div>
              <input type="range" min="10" max="200" defaultValue="100" className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded cursor-pointer" />

              <div className="flex justify-between items-center pt-2">
                <span>Opacity</span>
                <span className="font-mono text-indigo-400">100%</span>
              </div>
              <input type="range" min="0" max="100" defaultValue="100" className="w-full accent-indigo-500 h-1 bg-neutral-800 rounded cursor-pointer" />
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider mb-2">
              Audio Gain
            </div>
            <div className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800/80 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span>Volume Level</span>
                <span className="font-mono text-emerald-400">0.0 dB</span>
              </div>
              <input type="range" min="-24" max="12" defaultValue="0" className="w-full accent-emerald-500 h-1 bg-neutral-800 rounded cursor-pointer" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
