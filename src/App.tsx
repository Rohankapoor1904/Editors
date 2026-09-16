import React from 'react';
import { TopBar } from './components/TopBar';
import { AssetBin } from './components/AssetBin';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AIPromptConsole } from './components/AIPromptConsole';
import { TimelineTrackEditor } from './components/TimelineTrackEditor';
import { TranscriptEditor } from './components/TranscriptEditor';
import { ExportModal } from './components/ExportModal';
import { useTimelineStore } from './store/timelineStore';

export const App: React.FC = () => {
  const { activeWorkspace, undo, redo } = useTimelineStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Z or Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="h-screen w-screen bg-neutral-950 flex flex-col font-sans overflow-hidden text-neutral-200">
      {/* Top Application Navbar */}
      <TopBar />

      {/* Main Workspace Area */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Media & Asset Bin */}
        <AssetBin />

        {/* Center Panel View depending on active Workspace Mode */}
        {activeWorkspace === 'ai' ? (
          <div className="flex-1 flex p-2 space-x-2 bg-neutral-950 min-h-0">
            <ProgramMonitor />
            <div className="w-96">
              <TranscriptEditor />
            </div>
          </div>
        ) : activeWorkspace === 'export' ? (
          <div className="flex-1 flex items-center justify-center bg-neutral-950 p-4">
            <ExportModal />
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
