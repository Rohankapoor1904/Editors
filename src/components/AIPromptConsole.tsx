import React, { useState } from 'react';
import {
  Sparkles, Send, Bot, Sliders, Scissors, Captions, VolumeX, Palette, Wand2,
  CheckCircle2, Undo2, ChevronDown, ChevronRight, Slash, Check,
  RefreshCw, Volume2, Sun, Layers, AlertCircle
} from 'lucide-react';
import { SilenceTrimmerModal } from './SilenceTrimmerModal';
import { BridgePanel } from './BridgePanel';
import { useTimelineStore } from '../store/timelineStore';
import { agentOrchestrator } from '../services/agentOrchestrator';
import { useAgentStore, ActionDiff } from '../store/agentStore';

export type { ActionDiff };

export interface AIPromptConsoleProps {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const AIPromptConsole: React.FC<AIPromptConsoleProps> = ({ width, className = '', style }) => {
  const [activeTab, setActiveTab] = useState<'copilot' | 'inspector'>('copilot');
  const [prompt, setPrompt] = useState('');
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showSilenceModal, setShowSilenceModal] = useState(false);

  // Global Agent Store
  const isConnected = useAgentStore((s) => s.isConnected);
  const activeModel = useAgentStore((s) => s.activeModel);
  const bridgeAvailability = useAgentStore((s) => s.bridgeAvailability);
  const bridgeUrl = useAgentStore((s) => s.bridgeUrl);
  const currentTask = useAgentStore((s) => s.currentTask);
  const actionDiffs = useAgentStore((s) => s.actionDiffs);
  const isProcessing = useAgentStore((s) => s.isProcessing);
  const startTask = useAgentStore((s) => s.startTask);
  const updateTaskStep = useAgentStore((s) => s.updateTaskStep);
  const addTaskLog = useAgentStore((s) => s.addTaskLog);
  const completeTask = useAgentStore((s) => s.completeTask);
  const failTask = useAgentStore((s) => s.failTask);
  const addActionDiff = useAgentStore((s) => s.addActionDiff);
  const updateActionDiffStatus = useAgentStore((s) => s.updateActionDiffStatus);
  const acceptAllDiffs = useAgentStore((s) => s.acceptAllDiffs);
  const rollbackDiffs = useAgentStore((s) => s.rollbackDiffs);

  // Active step calculation: -1 when idle, 0..3 when running, 3 when completed
  const activeStep = currentTask
    ? currentTask.currentStep
    : -1;

  // Accordion state for Inspector
  const [inspectorSections, setInspectorSections] = useState({
    transform: true,
    audio: true,
    color: true,
  });

  const selectedClipIds = useTimelineStore(s => s.selectedClipIds);
  const tracks = useTimelineStore(s => s.tracks);
  const updateClipTransform = useTimelineStore(s => s.updateClipTransform);
  const updateClipVolume = useTimelineStore(s => s.updateClipVolume);
  const updateClipEffect = useTimelineStore(s => s.updateClipEffect);

  const getSelectedClip = () => {
    if (selectedClipIds.length === 0) return null;
    const clipId = selectedClipIds[0];
    for (const track of tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) return clip;
    }
    return null;
  };

  // ---- Inspector (R22.3): every control below reads the selected clip and
  // dispatches a real undoable command. No `defaultValue`-only inputs.
  const inspectorClip = getSelectedClip();
  const inspectorTransform = inspectorClip?.transform ?? {
    position: { x: 0.5, y: 0.5 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
    anchorPoint: { x: 0.5, y: 0.5 },
  };
  const inspectorGradeParams = (inspectorClip?.effects?.find(e => e.type === 'colorGrade')?.params ?? {}) as {
    contrast?: number;
    temperature?: number;
  };

  const inspectorColorEffectId =
    inspectorClip?.effects?.find(e => e.type === 'colorGrade')?.id || 'color_grade_effect';

  const handleInspectorScale = (pct: number) => {
    if (!inspectorClip) return;
    const s = pct / 100;
    updateClipTransform(inspectorClip.id, {
      ...inspectorTransform,
      scale: { x: s, y: s },
    });
  };

  const handleInspectorPosition = (axis: 'x' | 'y', value: number) => {
    if (!inspectorClip || !Number.isFinite(value)) return;
    updateClipTransform(inspectorClip.id, {
      ...inspectorTransform,
      position: { ...inspectorTransform.position, [axis]: value },
    });
  };

  const handleInspectorOpacity = (pct: number) => {
    if (!inspectorClip) return;
    updateClipTransform(inspectorClip.id, { ...inspectorTransform, opacity: pct / 100 });
  };

  const handleInspectorVolume = (db: number) => {
    if (!inspectorClip || !Number.isFinite(db)) return;
    updateClipVolume(inspectorClip.id, db);
  };

  const handleInspectorContrast = (v: number) => {
    if (!inspectorClip || !Number.isFinite(v)) return;
    updateClipEffect(inspectorClip.id, inspectorColorEffectId, 'colorGrade', {
      contrast: 1 + v / 100,
    });
  };

  const handleInspectorTemperature = (v: number) => {
    if (!inspectorClip || !Number.isFinite(v)) return;
    updateClipEffect(inspectorClip.id, inspectorColorEffectId, 'colorGrade', {
      temperature: v / 100,
    });
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

    const taskId = startTask({ source: 'copilot', prompt: cmdToRun });
    updateTaskStep(taskId, 0, 'Analyzing prompt intent...');

    try {
      const commands = await agentOrchestrator.processPrompt(cmdToRun, (log) => {
        addTaskLog(taskId, { type: log.type, message: log.message });
        if (log.type === 'thought') {
          updateTaskStep(taskId, 1, 'Transcribing & Planning...');
        } else if (log.type === 'tool') {
          updateTaskStep(taskId, 2, 'Executing timeline tools...');
        } else if (log.type === 'response') {
          updateTaskStep(taskId, 3, 'Arranging timeline...');
        }
      });

      const { CompoundCommand } = await import('../core/commands/transaction');

      // R22.3: zero-command plans (e.g. unknown intents, already explained by
      // the orchestrator's no-plan response log) produce no diff card.
      if (commands.length > 0) {
        const compound = new CompoundCommand(commands);

        const newDiff: ActionDiff = {
          id: `diff-${Date.now()}`,
          type: cmdToRun.includes('silence') ? 'cut' : cmdToRun.includes('color') ? 'color' : 'subtitle',
          title: `AI Action: ${cmdToRun.slice(0, 24)}...`,
          description: `Generated ${commands.length} timeline edits based on "${cmdToRun}"`,
          changeType: 'modified',
          timestamp: 'Just now',
          status: 'pending',
          command: compound,
        };

        addActionDiff(newDiff);
      }
      completeTask(taskId, commands.length);
    } catch (err: any) {
      // R22.3: record the failure on the task. Do NOT re-throw: this handler
      // is fire-and-forget, so a bare throw becomes an unhandled rejection.
      failTask(taskId, err.message || String(err));
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
        acceptAllDiffs();
      });
    });
  };

  const handleRollback = () => {
    import('../store/timelineStore').then(({ useTimelineStore }) => {
      useTimelineStore.getState().undo();
      rollbackDiffs();
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
              {isProcessing ? (
                <span className="flex items-center space-x-1 text-indigo-400 text-[10px] animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Processing...</span>
                </span>
              ) : isConnected ? (
                <span className="flex items-center space-x-1 text-emerald-400 text-[10px] font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Bridge Connected</span>
                </span>
              ) : bridgeAvailability === 'unavailable-in-production' ? (
                <span className="flex items-center space-x-1 text-amber-400 text-[10px] font-mono" title="External agent bridge only runs inside the Vite dev server. Run npm run dev for IDE/LLM access.">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Bridge unavailable in production</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 text-neutral-500 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
                  <span>Ready</span>
                </span>
              )}
            </div>

            {/* Stepper Bar */}
            <div className="flex items-center justify-between relative px-1">
              <div className="absolute top-2.5 left-4 right-4 h-0.5 bg-neutral-800 z-0" />
              {steppers.map((step, idx) => {
                const isCompleted = currentTask?.status === 'completed';
                const isFailed = currentTask?.status === 'failed' && idx === activeStep;
                const isDone = isCompleted || (activeStep >= 0 && idx < activeStep);
                const isCurrent = !isCompleted && !isFailed && idx === activeStep && isProcessing;

                return (
                  <div key={step.key} className="flex flex-col items-center relative z-10">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        isDone
                          ? 'bg-teal-accent text-dark-950 shadow-md shadow-teal-500/30 ring-2 ring-teal-400/50'
                          : isCurrent
                          ? 'bg-indigo-accent text-white ring-2 ring-indigo-400 animate-pulse shadow-md shadow-indigo-500/40'
                          : isFailed
                          ? 'bg-rose-500 text-white ring-2 ring-rose-400'
                          : 'bg-dark-950 text-neutral-500 border border-neutral-800'
                      }`}
                    >
                      {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                    </div>
                    <span
                      className={`text-[9px] mt-1 font-medium transition-colors ${
                        isDone ? 'text-teal-400' : isCurrent ? 'text-indigo-400' : isFailed ? 'text-rose-400' : 'text-neutral-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Active Model / Status Indicator */}
            <div className="mt-2.5 pt-2 border-t border-neutral-800/60 flex items-center justify-between text-[10px] text-neutral-400">
              <span className="flex items-center space-x-1.5 truncate max-w-[200px]" title={activeModel}>
                <Bot className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="truncate text-neutral-300 font-mono text-[9px]">{activeModel}</span>
              </span>
              <span className="font-mono text-[9px] text-neutral-500 shrink-0">
                {currentTask?.currentStepLabel || (isConnected ? 'Bridge Active (/api/agent)' : bridgeAvailability === 'unavailable-in-production' ? `Bridge unavailable in production${bridgeUrl ? ` (${bridgeUrl})` : ''} — run npm run dev` : 'Idle')}
              </span>
            </div>
          </div>

          {/* Main Execution Content: Live Logs, Diff Cards & Ready State */}
          <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-dark-950">
            {/* Bridge transport for external IDE/LLM callers (R23.4) */}
            <BridgePanel />
            {/* Active / Recent Task Stream */}
            {currentTask && (
              <div className="p-2.5 rounded-panel bg-dark-900 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
                        currentTask.source === 'bridge'
                          ? 'bg-purple-950/80 text-purple-300 border border-purple-500/40'
                          : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/40'
                      }`}
                    >
                      {currentTask.source === 'bridge' ? 'Agent Bridge' : 'Copilot Task'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center space-x-1 ${
                        currentTask.status === 'running'
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : currentTask.status === 'completed'
                          ? 'bg-teal-500/20 text-teal-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {currentTask.status === 'running' && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                      {currentTask.status === 'completed' && <Check className="w-2.5 h-2.5" />}
                      {currentTask.status === 'failed' && <AlertCircle className="w-2.5 h-2.5" />}
                      <span>{currentTask.status}</span>
                    </span>
                  </div>
                  <span className="text-[9px] text-neutral-500 font-mono">{currentTask.createdAt}</span>
                </div>

                <div className="text-xs text-neutral-200 font-medium break-words">
                  "{currentTask.prompt || currentTask.tool}"
                </div>

                {/* Live Thought / Tool Log Window */}
                {currentTask.logs && currentTask.logs.length > 0 && (
                  <div className="bg-dark-950 rounded border border-neutral-800/80 p-2 font-mono text-[10px] space-y-1 max-h-36 overflow-y-auto">
                    {currentTask.logs.map((log) => (
                      <div key={log.id} className="flex items-start space-x-1.5">
                        <span
                          className={`font-bold shrink-0 ${
                            log.type === 'thought'
                              ? 'text-purple-400'
                              : log.type === 'tool'
                              ? 'text-cyan-400'
                              : log.type === 'response'
                              ? 'text-teal-400'
                              : 'text-neutral-400'
                          }`}
                        >
                          [{log.type}]
                        </span>
                        <span className="text-neutral-300 break-words">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Diff List & Global Accept / Rollback Controls */}
            {actionDiffs.length > 0 && (
              <div className="space-y-2 pt-1">
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
                          onClick={() => updateActionDiffStatus(diff.id, 'rejected')}
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
                              updateActionDiffStatus(diff.id, 'accepted');
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
            )}

            {/* Clean Idle / Ready State when no task or diffs exist */}
            {!currentTask && actionDiffs.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-neutral-400 space-y-3 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-dark-900 border border-neutral-800 flex items-center justify-center shadow-inner">
                  <Bot className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-neutral-200">Agentic Pipeline Ready</h3>
                  <p className="text-[11px] text-neutral-500 max-w-[240px] mt-1 leading-relaxed">
                    Connect any external model or agent via <code className="text-indigo-300 font-mono text-[10px]">/api/agent</code> or enter an edit prompt below.
                  </p>
                </div>

                {/* Quick Suggestion Chips */}
                <div className="pt-2 flex flex-wrap gap-1.5 justify-center max-w-[260px]">
                  {slashCommands.slice(0, 4).map((sc) => (
                    <button
                      key={sc.command}
                      type="button"
                      onClick={() => handleRunCommand(undefined, sc.command)}
                      className="px-2 py-1 rounded bg-dark-900 hover:bg-dark-850 border border-neutral-800 hover:border-indigo-500/50 text-[10px] text-neutral-300 hover:text-white transition-all flex items-center space-x-1"
                    >
                      {sc.icon}
                      <span>{sc.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                {!inspectorClip && (
                  <p className="text-neutral-500 text-[11px]">Select a clip to inspect its properties.</p>
                )}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Scale</span>
                    <span className="font-mono text-indigo-400 font-semibold tabular-nums">
                      {Math.round(inspectorTransform.scale.x * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    data-testid="inspector-scale"
                    value={Math.round(inspectorTransform.scale.x * 100)}
                    disabled={!inspectorClip}
                    onChange={(e) => handleInspectorScale(parseFloat(e.target.value))}
                    className="w-full accent-indigo-accent h-1 bg-neutral-800 rounded cursor-pointer disabled:opacity-40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-neutral-500 block mb-1">Position X (0–1)</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      data-testid="inspector-pos-x"
                      value={inspectorTransform.position.x}
                      disabled={!inspectorClip}
                      onChange={(e) => handleInspectorPosition('x', parseFloat(e.target.value))}
                      className="w-full bg-dark-900 border border-subtle rounded px-2 py-1 font-mono text-xs text-neutral-200 disabled:opacity-40"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-500 block mb-1">Position Y (0–1)</span>
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      data-testid="inspector-pos-y"
                      value={inspectorTransform.position.y}
                      disabled={!inspectorClip}
                      onChange={(e) => handleInspectorPosition('y', parseFloat(e.target.value))}
                      className="w-full bg-dark-900 border border-subtle rounded px-2 py-1 font-mono text-xs text-neutral-200 disabled:opacity-40"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Opacity</span>
                    <span className="font-mono text-indigo-400 font-semibold tabular-nums">
                      {Math.round(inspectorTransform.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    data-testid="inspector-opacity"
                    value={Math.round(inspectorTransform.opacity * 100)}
                    disabled={!inspectorClip}
                    onChange={(e) => handleInspectorOpacity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-accent h-1 bg-neutral-800 rounded cursor-pointer disabled:opacity-40"
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
                    <span className="font-mono text-teal-400 font-semibold tabular-nums">
                      {(inspectorClip?.volume ?? 0).toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-24"
                    max="12"
                    step="0.5"
                    data-testid="inspector-volume"
                    value={inspectorClip?.volume ?? 0}
                    disabled={!inspectorClip}
                    onChange={(e) => handleInspectorVolume(parseFloat(e.target.value))}
                    className="w-full accent-teal-accent h-1 bg-neutral-800 rounded cursor-pointer disabled:opacity-40"
                  />
                </div>

                <p className="text-[11px] text-neutral-500">
                  Voice isolation lives in the Audio workspace mixer.
                </p>
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
                    <span className="text-neutral-400">Temperature</span>
                    <span className="font-mono text-purple-400 font-semibold tabular-nums">
                      {((inspectorGradeParams.temperature ?? 0) >= 0 ? '+' : '') +
                        ((inspectorGradeParams.temperature ?? 0) * 100).toFixed(0)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    data-testid="inspector-temperature"
                    value={Math.round((inspectorGradeParams.temperature ?? 0) * 100)}
                    disabled={!inspectorClip}
                    onChange={(e) => handleInspectorTemperature(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 h-1 bg-neutral-800 rounded cursor-pointer disabled:opacity-40"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-neutral-400">Contrast</span>
                    <span className="font-mono text-purple-400 font-semibold tabular-nums">
                      +{Math.round(((inspectorGradeParams.contrast ?? 1) - 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    data-testid="inspector-contrast"
                    value={Math.round(((inspectorGradeParams.contrast ?? 1) - 1) * 100)}
                    disabled={!inspectorClip}
                    onChange={(e) => handleInspectorContrast(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 h-1 bg-neutral-800 rounded cursor-pointer disabled:opacity-40"
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
