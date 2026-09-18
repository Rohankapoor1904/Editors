const fs = require('fs');

const content = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

// We need to add Save/Open Project functionality to the File menu and import the persistence functions

let newContent = content.replace(
  "import { getRuntimeMode, setRuntimeMode, subscribeRuntimeMode, RuntimeMode } from '../services/runtimeConfig';",
  "import { getRuntimeMode, setRuntimeMode, subscribeRuntimeMode, RuntimeMode } from '../services/runtimeConfig';\nimport { serializeProject, deserializeProject } from '../core/project/serialize';\nimport { useMediaPoolStore } from '../store/mediaPool';"
);

// We need to bring useMediaPoolStore inside TopBar to handle setting assets on load
newContent = newContent.replace(
  "  const {",
  "  const { assets: mediaPoolAssets, addAsset } = useMediaPoolStore();\n  const {"
);

// Replace the File menu items
newContent = newContent.replace(
  "File: [\n      { label: 'Export...', action: () => setWorkspace('export') },\n    ],",
  `File: [
      { label: 'Save Project', action: () => {
        const state = useTimelineStore.getState();
        try {
          const jsonString = serializeProject(state, mediaPoolAssets);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'project.cinecraft';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Failed to save project', err);
          alert('Failed to save project. Ensure all fields are filled.');
        }
      } },
      { label: 'Open Project', action: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.cinecraft,application/json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (re) => {
            try {
              const text = re.target?.result as string;
              const { timelineState, assets } = deserializeProject(text);

              // Load assets into media pool
              for (const a of assets) {
                addAsset(a);
              }

              // Set timeline state
              useTimelineStore.setState({
                version: timelineState.version,
                projectId: timelineState.projectId,
                metadata: timelineState.metadata,
                tracks: timelineState.tracks,
                playheadPosition: { value: 0, rate: 1 },
                selectedClipIds: []
              });
            } catch (err) {
              console.error('Failed to open project', err);
              alert('Failed to open project file: Invalid format');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      } },
      { divider: true },
      { label: 'Export...', action: () => setWorkspace('export') },
    ],`
);

fs.writeFileSync('src/components/TopBar.tsx', newContent);
