import React from 'react';
import { TopBar } from './components/TopBar';
import { AssetBin } from './components/AssetBin';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AIPromptConsole } from './components/AIPromptConsole';
import { TimelineTrackEditor } from './components/TimelineTrackEditor';

export const App: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-neutral-950 flex flex-col font-sans overflow-hidden text-neutral-200">
      {/* Top Application Navbar */}
      <TopBar />

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Media & Asset Bin */}
        <AssetBin />

        {/* Center: WebGPU Program Monitor Canvas */}
        <ProgramMonitor />

        {/* Right: AI Copilot Console */}
        <AIPromptConsole />
      </div>

      {/* Bottom: Multi-Track Timeline Editor */}
      <TimelineTrackEditor />
    </div>
  );
};

export default App;
