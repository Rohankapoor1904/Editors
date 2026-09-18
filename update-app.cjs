const fs = require('fs');

const content = fs.readFileSync('src/App.tsx', 'utf8');

// Import deserializeProject and useMediaPoolStore
let newContent = content.replace(
  "import { useTimelineStore } from './store/timelineStore';",
  "import { useTimelineStore } from './store/timelineStore';\nimport { useMediaPoolStore } from './store/mediaPool';\nimport { deserializeProject } from './core/project/serialize';"
);

// Add drag and drop functionality to the App root
newContent = newContent.replace(
  "const { activeWorkspace, undo, redo } = store;",
  "const { activeWorkspace, undo, redo } = store;\n  const { addAsset } = useMediaPoolStore();"
);

newContent = newContent.replace(
  "return (\n    <div className=\"h-screen w-screen bg-neutral-950 flex flex-col font-sans overflow-hidden text-neutral-200\">",
  `  const handleDrop = (e: React.DragEvent) => {
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
    >`
);

fs.writeFileSync('src/App.tsx', newContent);
