import React from 'react';
import { TopBar } from './components/TopBar';
import { AssetBin } from './components/AssetBin';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AIPromptConsole } from './components/AIPromptConsole';
import { TimelineTrackEditor } from './components/TimelineTrackEditor';
import { TranscriptEditor } from './components/TranscriptEditor';
import { ExportModal } from './components/ExportModal';
import { AudioWorkspace } from './components/AudioWorkspace';
import { ColorWorkspace } from './components/ColorWorkspace';
import { useTimelineStore } from './store/timelineStore';
import { useMediaPoolStore } from './store/mediaPool';
import { deserializeProject } from './core/project/serialize';
import { handleKeyboardShortcuts } from './utils/keyboardShortcuts';

export const App: React.FC = () => {
  const store = useTimelineStore();
  const { activeWorkspace, undo, redo } = store;
  const { addAsset } = useMediaPoolStore();

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
        return;
      }

      handleKeyboardShortcuts(e, store);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, undo, redo]);

    const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.cinecraft') || file.type === 'application/json')) {
      const reader = new FileReader();
      reader.onload = (re) => {
        try {
          const text = re.target?.result as string;
          const { timelineState, assets } = deserializeProject(text);
          for (const a of assets) {
            addAsset(a);
          }
          useTimelineStore.setState({
            version: timelineState.version,
            projectId: timelineState.projectId,
            metadata: timelineState.metadata,
            tracks: timelineState.tracks,
            playheadPosition: { value: 0, rate: 1 },
            selectedClipIds: []
          });
        } catch (err) {
          console.error('Failed to load project from drop', err);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div
      className="h-screen w-screen bg-neutral-950 flex flex-col font-sans overflow-hidden text-neutral-200"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
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
        ) : activeWorkspace === 'color' ? (
          <ColorWorkspace />
        ) : activeWorkspace === 'audio' ? (
          <AudioWorkspace />
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
