import React, { useState } from 'react';
import {
  Sparkles, Send, Bot, Sliders, Scissors, Captions, VolumeX, Palette, Wand2,
  CheckCircle2, Undo2, ChevronDown, ChevronRight, Slash, Check,
  RefreshCw, Volume2, Sun, Layers
} from 'lucide-react';
import { SilenceTrimmerModal } from './SilenceTrimmerModal';
import { useTimelineStore } from '../store/timelineStore';
import { agentOrchestrator } from '../services/agentOrchestrator';
import { Command } from '../core/commands';

export interface ActionDiff {
  id: string;
  type: 'cut' | 'subtitle' | 'denoise' | 'color';
  title: string;
  description: string;
  changeType: 'removed' | 'added' | 'modified';
  timestamp: string;
  status: 'pending' | 'accepted' | 'rejected';
  command?: Command;
}

export interface AIPromptConsoleProps {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const AIPromptConsole: React.FC<AIPromptConsoleProps> = ({ width, className = '', style }) => {
  const [activeTab, setActiveTab] = useState<'copilot' | 'inspector'>('copilot');
  const [prompt, setPrompt] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(3); // 0: Analyzing, 1: Transcribing, 2: Slicing, 3: Arranging (Completed)
  const [isProcessing, setIsProcessing] = useState(false);

  // Accordion state for Inspector
  const [inspectorSections, setInspectorSections] = useState({
    transform: true,
    audio: true,
    color: true,
  });

  // Action Diff Cards State
  const [actionDiffs, setActionDiffs] = useState<ActionDiff[]>([]);
  const [showSilenceModal, setShowSilenceModal] = useState(false);
  const selectedClipIds = useTimelineStore(s => s.selectedClipIds);
  const tracks = useTimelineStore(s => s.tracks);

  const getSelectedClip = () => {
    if (selectedClipIds.length === 0) return null;
    const clipId = selectedClipIds[0];
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  };


  const slashCommands = [
    { command: '/silence', label: 'Cut Silences', desc: 'Detect & trim dead air gaps > 0.5s', icon: <Scissors className="w-3.5 h-3.5 text-amber-400" /> },
    { command: '/captions', label: 'Auto Subtitles', desc: 'Transcribe speech with Whisper ONNX', icon: <Captions className="w-3.5 h-3.5 text-indigo-400" /> },
    { command: '/b-roll', label: 'Insert B-Roll', desc: 'Match timeline context with B-roll clips', icon: <Layers className="w-3.5 h-3.5 text-cyan-400" /> },
    { command: '/color', label: 'Color Match', desc: 'Auto-grade contrast & tone across clips', icon: <Palette className="w-3.5 h-3.5 text-purple-400" /> },
    { command: '/denoise', label: 'Denoise Audio', desc: 'Isolate vocal audio & reduce hum', icon: <VolumeX className="w-3.5 h-3.5 text-emerald-400" /> },
  ];

  const steppers = [
    { label: 'Analyzing', key: 'analyzing' },
    { label: 'Transcribing', key: 'transcribing' },
    { label: 'Slicing', key: 'slicing' },
    { label: 'Arranging', key: 'arranging' },
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPrompt(val);
    if (val.startsWith('/') || val === '/') {
      setShowSlashMenu(true);
    } else {
      setShowSlashMenu(false);
    }
  };

  const selectSlashCommand = (command: string) => {
    setPrompt(`${command} `);
    setShowSlashMenu(false);
  };

  const handleRunCommand = async (e?: React.FormEvent, customPrompt?: string) => {
    if (e) e.preventDefault();
    const cmdToRun = customPrompt || prompt;
    if (!cmdToRun.trim()) return;

    if (cmdToRun.trim().startsWith('/silence')) {
      setShowSilenceModal(true);
      setPrompt('');
      setShowSlashMenu(false);
      return;
    }


    setPrompt('');
    setShowSlashMenu(false);
    setIsProcessing(true);
    setActiveStep(0);

    try {
      const commands = await agentOrchestrator.processPrompt(cmdToRun, (log) => {
        // Advance stepper based on log messages if possible
        if (log.type === 'thought') {
          setActiveStep(1); // Analyzing / Planning
        } else if (log.type === 'tool') {
          setActiveStep(2); // Slicing / Action
        } else if (log.type === 'response') {
          setActiveStep(3); // Arranging / Completed
        }
      });

      setIsProcessing(false);
      setActiveStep(3);
      const { CompoundCommand } = await import('../core/commands/transaction');

      const newDiff: ActionDiff = {
        id: `diff-${Date.now()}`,
        type: cmdToRun.includes('silence') ? 'cut' : cmdToRun.includes('color') ? 'color' : 'subtitle',
        title: `AI Action: ${cmdToRun.slice(0, 24)}...`,
        description: `Generated ${commands.length} timeline edits based on "${cmdToRun}"`,
        changeType: 'modified',
        timestamp: 'Just now',
        status: 'pending',
        command: commands.length > 0 ? new CompoundCommand(commands) : undefined
      };
      setActionDiffs((prev) => [newDiff, ...prev]);
    } catch (err) {
      setIsProcessing(false);
      throw err;
    }
  };

  const handleAcceptAll = () => {
    import('../store/timelineStore').then(({ useTimelineStore }) => {
      import('../core/commands/transaction').then(({ CompoundCommand }) => {
        const pending = actionDiffs.filter(d => d.status === 'pending' && d.command);
        if (pending.length > 0) {
          const allCommands = pending.map(d => d.command!).filter(Boolean);
          if (allCommands.length > 0) {
            useTimelineStore.getState().executeCommand(new CompoundCommand(allCommands));
          }
        }
        setActionDiffs((prev) =>
          prev.map((d) => d.status === 'pending' ? { ...d, status: 'accepted' } : d)
        );
      });
    });
  };

  const handleRollback = () => {
    import('../store/timelineStore').then(({ useTimelineStore }) => {
      useTimelineStore.getState().undo();
      setActionDiffs((prev) =>
        prev.map((d) => ({ ...d, status: 'rejected' }))
      );
    });
  };

  const toggleInspectorSection = (section: 'transform' | 'audio' | 'color') => {
    setInspectorSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div
      style={{
        width: width ? `${width}px` : undefined,
        minWidth: width ? `${width}px` : undefined,
        maxWidth: width ? `${width}px` : undefined,
        ...style,
      }}
      className={`bg-dark-900 border-l border-subtle flex flex-col h-full select-none text-xs mesh-glow shrink-0 ${!width ? 'w-96' : ''} ${className}`}
    >
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-subtle px-3 py-2.5 bg-dark-950/60">
        <div className="flex space-x-1 bg-dark-950 p-1 rounded-panel border border-subtle w-full">
          <button
            onClick={() => setActiveTab('copilot')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-md font-medium text-[11px] transition-all ${
              activeTab === 'copilot'
                ? 'bg-gradient-to-r from-indigo-accent to-purple-600 text-white font-semibold shadow-md shadow-indigo-500/20'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            <span>AI Copilot</span>
          </button>

          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 rounded-md font-medium text-[11px] transition-all ${
              activeTab === 'inspector'
                ? 'bg-gradient-to-r from-indigo-accent to-purple-600 text-white font-semibold shadow-md shadow-indigo-500/20'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-purple-300" />
            <span>Inspector</span>
          </button>
        </div>
      </div>

      {activeTab === 'copilot' ? (
        <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
          {/* Visual Status Stepper Header */}
          <div className="p-3 border-b border-subtle bg-dark-950/40">
            <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider mb-2.5 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Wand2 className="w-3.5 h-3.5 text-indigo-accent" />
                <span>Agentic Execution Pipeline</span>
              </span>
              {isProcessing && (
                <span className="flex items-center space-x-1 text-indigo-400 text-[10px] animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </span>
              )}
            </div>

            {/* Stepper Bar */}
            <div className="flex items-center justify-between relative px-1">
              <div className="absolute top-2.5 left-4 right-4 h-0.5 bg-neutral-800 z-0" />
              {steppers.map((step, idx) => {
                const isDone = idx < activeStep || (idx === activeStep && !isProcessing);
                const isCurrent = idx === activeStep && isProcessing;
                return (
                  <div key={step.key} className="flex flex-col items-center relative z-10">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        isDone
                          ? 'bg-teal-accent text-dark-950 shadow-md shadow-teal-500/30 ring-2 ring-teal-400/50'
                          : isCurrent
                          ? 'bg-indigo-accent text-white ring-2 ring-indigo-400 animate-pulse shadow-md shadow-indigo-500/40'
                          : 'bg-dark-950 text-neutral-500 border border-subtle'
                      }`}
                    >
                      {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                    </div>
                    <span
                      className={`text-[9px] mt-1 font-medium transition-colors ${
                        isDone ? 'text-teal-400' : isCurrent ? 'text-indigo-400' : 'text-neutral-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Diff List & Global Accept / Rollback Controls */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-dark-950">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-neutral-300 flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-accent" />
                <span>AI Action Diffs ({actionDiffs.filter((d) => d.status === 'pending').length} Pending)</span>
              </div>

              {/* Accept All & Rollback Buttons */}
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleAcceptAll}
                  className="px-2 py-1 bg-teal-accent/20 hover:bg-teal-accent/30 text-teal-300 border border-teal-500/40 rounded-md text-[10px] font-medium flex items-center space-x-1 transition-all"
                  title="Accept all AI modifications"
                >
                  <CheckCircle2 className="w-3 h-3 text-teal-400" />
                  <span>Accept All</span>
                </button>
                <button
                  onClick={handleRollback}
                  className="px-2 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-md text-[10px] font-medium flex items-center space-x-1 transition-all"
                  title="Rollback AI changes"
                >
                  <Undo2 className="w-3 h-3 text-rose-400" />
                  <span>Rollback</span>
                </button>
              </div>
            </div>

            {/* Diff Cards */}
            {actionDiffs.map((diff) => (
              <div
                key={diff.id}
                className={`p-3 rounded-panel border transition-all ${
                  diff.status === 'accepted'
                    ? 'bg-teal-950/20 border-teal-500/30 opacity-70'
                    : diff.status === 'rejected'
                    ? 'bg-rose-950/20 border-rose-500/30 opacity-50 line-through'
                    : 'bg-dark-900 border-subtle hover:border-indigo-500/50 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    {diff.type === 'cut' ? (
                      <Scissors className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : diff.type === 'subtitle' ? (
                      <Captions className="w-4 h-4 text-indigo-400 shrink-0" />
                    ) : diff.type === 'denoise' ? (
                      <VolumeX className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Palette className="w-4 h-4 text-purple-400 shrink-0" />
                    )}
                    <div>
                      <h4 className="font-semibold text-neutral-200 text-xs">{diff.title}</h4>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{diff.description}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded font-bold ${
                      diff.changeType === 'removed'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : diff.changeType === 'added'
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    }`}
                  >
                    {diff.timestamp}
                  </span>
                </div>

                {/* Diff Card Action Buttons */}
                {diff.status === 'pending' && (
                  <div className="mt-2 pt-2 border-t border-subtle flex items-center justify-end space-x-2">
                    <button
                      onClick={() =>
                        setActionDiffs((prev) =>
                          prev.map((d) => (d.id === diff.id ? { ...d, status: 'rejected' } : d))
                        )
                      }
                      className="px-2 py-0.5 bg-dark-950 hover:bg-rose-950/50 text-neutral-400 hover:text-rose-300 border border-subtle rounded text-[10px] transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        import('../store/timelineStore').then(({ useTimelineStore }) => {
                          if (diff.command) {
                            useTimelineStore.getState().executeCommand(diff.command);
                          }
                          setActionDiffs((prev) =>
                            prev.map((d) => (d.id === diff.id ? { ...d, status: 'accepted' } : d))
                          );
                        });
                      }}
                      className="px-2 py-0.5 bg-indigo-accent hover:bg-indigo-hover text-white rounded text-[10px] font-medium shadow transition-colors flex items-center space-x-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Apply Diff</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Interactive Copilot Input Form & Slash Dropdown Popover */}
          <div className="p-3 bg-dark-900 border-t border-subtle relative">
            {/* Slash Command Dropdown Overlay */}
            {showSlashMenu && (
              <div className="absolute bottom-full left-3 right-3 mb-2 bg-[#121214] border border-indigo-500/80 rounded-panel shadow-2xl overflow-hidden z-50 max-h-36">
                <div className="px-3 py-1.5 bg-[#09090b] border-b border-subtle flex items-center justify-between text-[10px] text-indigo-300 font-semibold sticky top-0 z-10">
                  <span className="flex items-center space-x-1">
                    <Slash className="w-3 h-3 text-indigo-accent" />
                    <span>Slash Commands</span>
                  </span>
                  <span className="text-neutral-500 font-mono">Press Tab to select</span>
                </div>
                <div className="overflow-y-auto divide-y divide-subtle bg-[#121214] max-h-28">
                  {slashCommands.map((sc) => (
                    <button
                      key={sc.command}
                      type="button"
                      onClick={() => selectSlashCommand(sc.command)}
                      className="w-full px-3 py-2 text-left hover:bg-indigo-950/80 flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        {sc.icon}
                        <div>
                          <div className="font-mono text-indigo-300 group-hover:text-white font-semibold text-xs">
                            {sc.command} <span className="font-sans text-neutral-300 font-normal ml-1">({sc.label})</span>
                          </div>
                          <div className="text-[10px] text-neutral-400">{sc.desc}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-indigo-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Bar */}
            <form onSubmit={handleRunCommand}>
              <div className="relative flex items-center">
                <Bot className="w-4 h-4 absolute left-3 text-indigo-accent" />
                <input
                  type="text"
                  value={prompt}
                  onChange={handleInputChange}
                  placeholder="Type / for commands, or ask AI to edit..."
                  className="w-full bg-dark-950 text-neutral-200 text-xs pl-9 pr-9 py-2.5 rounded-panel border border-subtle focus:outline-none focus:border-indigo-accent placeholder-neutral-500 shadow-inner"
                />
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="absolute right-1.5 p-1.5 bg-gradient-to-r from-indigo-accent to-purple-600 hover:from-indigo-hover hover:to-purple-700 text-white rounded-md shadow-md transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : (
        /* Smooth Collapsible Inspector Accordions Tab */
        <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-dark-950 text-neutral-300">
          {/* Transform Section */}
          <div className="border border-subtle rounded-panel bg-dark-900 overflow-hidden">
            <button
              onClick={() => toggleInspectorSection('transform')}
              className="w-full px-3 py-2.5 bg-dark-900 hover:bg-dark-850 flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Layers className="w-3.5 h-3.5 text-indigo-accent" />
                <span className="font-semibold text-xs text-neutral-200">Transform & Geometry</span>
              </div>
              {inspectorSections.transform ? (
                <ChevronDown className="w-4 h-4 text-neutral-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              )}
            </button>

            {inspectorSections.transform && (
              <div className="p-3 border-t border-subtle space-y-3 bg-dark-950/60 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Scale</span>
                    <span className="font-mono text-indigo-400 font-semibold tabular-nums">100%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    defaultValue="100"
                    className="w-full accent-indigo-accent h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-500 block mb-1">Position X</span>
                    <input
                      type="number"
                      defaultValue="0"
                      className="w-full bg-dark-900 border border-subtle rounded px-2 py-1 font-mono text-xs text-neutral-200"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block mb-1">Position Y</span>
                    <input
                      type="number"
                      defaultValue="0"
                      className="w-full bg-dark-900 border border-subtle rounded px-2 py-1 font-mono text-xs text-neutral-200"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Opacity</span>
                    <span className="font-mono text-indigo-400 font-semibold tabular-nums">100%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    defaultValue="100"
                    className="w-full accent-indigo-accent h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Audio Levels Accordion */}
          <div className="border border-subtle rounded-panel bg-dark-900 overflow-hidden">
            <button
              onClick={() => toggleInspectorSection('audio')}
              className="w-full px-3 py-2.5 bg-dark-900 hover:bg-dark-850 flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Volume2 className="w-3.5 h-3.5 text-teal-accent" />
                <span className="font-semibold text-xs text-neutral-200">Audio Levels & Vocal Isolation</span>
              </div>
              {inspectorSections.audio ? (
                <ChevronDown className="w-4 h-4 text-neutral-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              )}
            </button>

            {inspectorSections.audio && (
              <div className="p-3 border-t border-subtle space-y-3 bg-dark-950/60 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Volume Level</span>
                    <span className="font-mono text-teal-400 font-semibold tabular-nums">0.0 dB</span>
                  </div>
                  <input
                    type="range"
                    min="-24"
                    max="12"
                    defaultValue="0"
                    className="w-full accent-teal-accent h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-neutral-400">AI Vocal Suppressor</span>
                  <input type="checkbox" defaultChecked className="accent-teal-accent rounded cursor-pointer w-4 h-4" />
                </div>
              </div>
            )}
          </div>

          {/* Color Grading Accordion */}
          <div className="border border-subtle rounded-panel bg-dark-900 overflow-hidden">
            <button
              onClick={() => toggleInspectorSection('color')}
              className="w-full px-3 py-2.5 bg-dark-900 hover:bg-dark-850 flex items-center justify-between text-left transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Sun className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-semibold text-xs text-neutral-200">Color Grading & Tone</span>
              </div>
              {inspectorSections.color ? (
                <ChevronDown className="w-4 h-4 text-neutral-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              )}
            </button>

            {inspectorSections.color && (
              <div className="p-3 border-t border-subtle space-y-3 bg-dark-950/60 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Exposure</span>
                    <span className="font-mono text-purple-400 font-semibold tabular-nums">+0.15 EV</span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.05"
                    defaultValue="0.15"
                    className="w-full accent-purple-500 h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Contrast</span>
                    <span className="font-mono text-purple-400 font-semibold tabular-nums">+10%</span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    defaultValue="10"
                    className="w-full accent-purple-500 h-1 bg-neutral-800 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Silence Trimmer Modal */}
      <SilenceTrimmerModal
        isOpen={showSilenceModal}
        onClose={() => setShowSilenceModal(false)}
        clip={getSelectedClip()}
      />

    </div>
  );
};
