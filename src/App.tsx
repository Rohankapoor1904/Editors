import React from 'react';
import { TopBar } from './components/TopBar';
import { AssetBin } from './components/AssetBin';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AIPromptConsole } from './components/AIPromptConsole';
import { TimelineTrackEditor } from './components/TimelineTrackEditor';
import { TranscriptEditor } from './components/TranscriptEditor';
import { useTimelineStore } from './store/timelineStore';

export const App: React.FC = () => {
  const { activeWorkspace } = useTimelineStore();

  return (
    <div className="h-screen w-screen bg-neutral-950 flex flex-col font-sans overflow-hidden text-neutral-200">
      {/* Top Application Navbar */}
      <TopBar />

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Media & Asset Bin */}
        <AssetBin />

        {/* Center: Program Monitor Canvas OR Transcript Editor depending on workspace */}
        {activeWorkspace === 'ai' ? (
          <div className="flex-1 flex p-2 space-x-2 bg-neutral-950">
            <ProgramMonitor />
            <div className="w-96">
              <TranscriptEditor />
            </div>
          </div>
        ) : (
          <ProgramMonitor />
        )}

        {/* Right: AI Copilot Console */}
        <AIPromptConsole />
      </div>

      {/* Bottom: Multi-Track Timeline Editor */}
      <TimelineTrackEditor />
    </div>
  );
};

export default App;
