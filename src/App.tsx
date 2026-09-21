import React from 'react';
import { TopBar } from './components/TopBar';
import { AssetBin } from './components/AssetBin';
import { SourceMonitor } from './components/SourceMonitor';
import { ProgramMonitor } from './components/ProgramMonitor';
import { AIPromptConsole } from './components/AIPromptConsole';
import { TimelineTrackEditor } from './components/TimelineTrackEditor';
import { TranscriptEditor } from './components/TranscriptEditor';
import { ExportModal } from './components/ExportModal';
import { AudioWorkspace } from './components/AudioWorkspace';
import { ColorWorkspace } from './components/ColorWorkspace';
import { ResizableSplitter } from './components/layout/ResizableSplitter';
import { useLayoutStore } from './store/layoutStore';
import { FolderOpen, Sparkles } from 'lucide-react';
import { useTimelineStore } from './store/timelineStore';
import { useMediaPoolStore } from './store/mediaPool';
import { deserializeProject } from './core/project/serialize';
import { handleKeyboardShortcuts } from './utils/keyboardShortcuts';
import { saveAutosave, loadAutosave } from './services/projectPersistence';
import { agentBridge } from './services/agentBridge';

export const App: React.FC = () => {
  const store = useTimelineStore();
  const { activeWorkspace, undo, redo } = store;
  const { addAsset } = useMediaPoolStore();
  const assets = useMediaPoolStore(s => s.assets);

  const {
    leftPanelWidth,
    leftPanelCollapsed,
    rightPanelWidth,
    rightPanelCollapsed,
    timelineHeight,
    timelineCollapsed,
    monitorViewMode,
    sourceMonitorRatio,
    resizeLeftPanel,
    toggleLeftPanel,
    resizeRightPanel,
    toggleRightPanel,
    resizeTimeline,
    toggleTimeline,
    resizeMonitorRatio,
  } = useLayoutStore();

  React.useEffect(() => {
    loadAutosave();
    agentBridge.start();
    return () => agentBridge.stop();
  }, []);

  React.useEffect(() => {
    const saveTimeout = setTimeout(() => {
      saveAutosave(store, assets);
    }, 2000);
    return () => clearTimeout(saveTimeout);
  }, [store, assets]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is editing text in an input or textarea
      const target = e.target as HTMLElement;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      // Cmd+Z or Ctrl+Z (Undo) / Cmd+Shift+Z, Ctrl+Shift+Z or Ctrl+Y (Redo)
      const isKeyZ = e.key === 'z' || e.key === 'Z';
      const isKeyY = e.key === 'y' || e.key === 'Y';

      if (!isInput && (e.metaKey || e.ctrlKey)) {
        if (isKeyZ) {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        } else if (isKeyY) {
          e.preventDefault();
          redo();
          return;
        }
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

      {/* Main Workspace Area (Top/Middle) */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Left: Media & Asset Bin */}
        {!leftPanelCollapsed && (
          <AssetBin width={leftPanelWidth} />
        )}

        {/* Floating expand button when left panel is collapsed */}
        {leftPanelCollapsed && (
          <button
            onClick={toggleLeftPanel}
            className="absolute left-0 top-12 z-30 p-1.5 bg-dark-900/90 border border-neutral-800 border-l-0 rounded-r-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shadow-lg"
            title="Expand Project Bin"
          >
            <FolderOpen className="w-4 h-4 text-indigo-400" />
          </button>
        )}

        {/* Left Resizable Splitter */}
        <ResizableSplitter
          direction="horizontal"
          onResize={resizeLeftPanel}
          onCollapseToggle={toggleLeftPanel}
          isCollapsed={leftPanelCollapsed}
          collapsePosition="start"
        />

        {/* Center Panel View depending on active Workspace Mode */}
        {activeWorkspace === 'ai' ? (
          <div className="flex-1 flex p-2 space-x-2 bg-neutral-950 min-h-0 overflow-hidden">
            <ProgramMonitor />
            <div className="w-96 shrink-0">
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
          <div className="flex-1 flex bg-neutral-950 min-h-0 overflow-hidden relative">
            {monitorViewMode === 'dual' ? (
              <>
                {/* Source Monitor */}
                <div
                  style={{ width: `${Math.round(sourceMonitorRatio * 100)}%` }}
                  className="h-full min-w-[240px] overflow-hidden flex flex-col min-h-0"
                >
                  <SourceMonitor />
                </div>

                {/* Splitter between Source and Program Monitor */}
                <ResizableSplitter
                  direction="horizontal"
                  onResize={(delta) => {
                    const centerWidth = window.innerWidth - (leftPanelCollapsed ? 0 : leftPanelWidth) - (rightPanelCollapsed ? 0 : rightPanelWidth);
                    if (centerWidth > 100) {
                      resizeMonitorRatio(delta / centerWidth);
                    }
                  }}
                />

                {/* Program Monitor */}
                <div
                  style={{ width: `${Math.round((1 - sourceMonitorRatio) * 100)}%` }}
                  className="h-full min-w-[240px] overflow-hidden flex flex-col min-h-0"
                >
                  <ProgramMonitor />
                </div>
              </>
            ) : (
              /* Single Monitor View: Program Monitor takes 100% full width */
              <div className="flex-1 h-full w-full overflow-hidden flex flex-col min-h-0 min-w-0">
                <ProgramMonitor />
              </div>
            )}
          </div>
        )}

        {/* Right Resizable Splitter */}
        <ResizableSplitter
          direction="horizontal"
          onResize={resizeRightPanel}
          onCollapseToggle={toggleRightPanel}
          isCollapsed={rightPanelCollapsed}
          collapsePosition="end"
        />

        {/* Floating expand button when right panel is collapsed */}
        {rightPanelCollapsed && (
          <button
            onClick={toggleRightPanel}
            className="absolute right-0 top-12 z-30 p-1.5 bg-dark-900/90 border border-neutral-800 border-r-0 rounded-l-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors shadow-lg"
            title="Expand AI Copilot & Inspector"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </button>
        )}

        {/* Right: AI Copilot Console */}
        {!rightPanelCollapsed && (
          <AIPromptConsole width={rightPanelWidth} />
        )}
      </div>

      {/* Horizontal Timeline Resizable Splitter */}
      <ResizableSplitter
        direction="vertical"
        onResize={resizeTimeline}
        onCollapseToggle={toggleTimeline}
        isCollapsed={timelineCollapsed}
      />

      {/* Bottom: Multi-Track Timeline Editor */}
      {!timelineCollapsed && (
        <TimelineTrackEditor height={timelineHeight} />
      )}
    </div>
  );
};

export default App;
