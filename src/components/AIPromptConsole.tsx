import React, { useState } from 'react';
import { Sparkles, Send, Bot, Terminal } from 'lucide-react';
import { useTimelineStore } from '../store/timelineStore';

export const AIPromptConsole: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [agentLogs, setAgentLogs] = useState<string[]>([
    'System initialized ReAct AI Agent Orchestrator.',
    'Loaded tools: probe_media, transcribe_and_align, detect_silence, cut_and_arrange_timeline.',
  ]);

  const { rippleDelete } = useTimelineStore();

  const handleRunCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    const userCmd = prompt;
    setAgentLogs((prev) => [...prev, `> User Prompt: "${userCmd}"`]);
    setPrompt('');

    // Mock autonomous tool calling execution loop
    setTimeout(() => {
      setAgentLogs((prev) => [
        ...prev,
        `[Agent Thought]: Analyzing audio track for silence periods > 0.5s...`,
      ]);
    }, 400);

    setTimeout(() => {
      rippleDelete(5.0, 2.5);
      setAgentLogs((prev) => [
        ...prev,
        `[Tool Executed]: detect_silence() -> Found 1 silence window (5.0s to 7.5s).`,
        `[Tool Executed]: cut_and_arrange_timeline() -> Performed automated ripple delete.`,
        `[Agent Response]: Successfully removed 2.5s of silent pause from timeline!`,
      ]);
    }, 1200);
  };

  return (
    <div className="w-80 bg-neutral-900 border-l border-neutral-800 flex flex-col h-full select-none text-xs">
      {/* Header */}
      <div className="flex items-center space-x-2 px-3 py-2 border-b border-neutral-800 font-semibold text-neutral-200">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span>AI Copilot & Console</span>
      </div>

      {/* Agent Activity / Log Monitor */}
      <div className="flex-1 bg-neutral-950 p-3 overflow-y-auto font-mono text-[11px] text-neutral-400 space-y-2 border-b border-neutral-800">
        <div className="flex items-center space-x-1.5 text-indigo-400 font-sans font-semibold mb-2">
          <Terminal className="w-3.5 h-3.5" />
          <span>Execution Output Log</span>
        </div>
        {agentLogs.map((log, idx) => (
          <div
            key={idx}
            className={`p-1.5 rounded ${
              log.startsWith('>')
                ? 'bg-indigo-950/60 text-indigo-300 font-sans'
                : log.includes('Tool Executed')
                ? 'bg-neutral-900 text-green-400'
                : log.includes('Agent Response')
                ? 'bg-purple-950/60 text-purple-300 font-semibold font-sans'
                : 'text-neutral-500'
            }`}
          >
            {log}
          </div>
        ))}
      </div>

      {/* Action Prompt Form */}
      <form onSubmit={handleRunCommand} className="p-2 bg-neutral-900">
        <div className="relative flex items-center">
          <Bot className="w-4 h-4 absolute left-2.5 text-indigo-400" />
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., 'Cut all pauses > 0.5s and add subtitles'"
            className="w-full bg-neutral-950 text-neutral-200 text-xs pl-8 pr-8 py-2 rounded border border-neutral-800 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="absolute right-1.5 p-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </form>
    </div>
  );
};
