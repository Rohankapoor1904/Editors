const fs = require('fs');

let content = fs.readFileSync('PROGRESS.md', 'utf8');

// Replace lines with done
content = content.replace(
  '| **R10.3** | Playback | Timeline clip WebAudio playback engine | `todo` | unclaimed | `src/engine/audioEngine.ts` (depends on R9.4) |',
  '| **R10.3** | Playback | Timeline clip WebAudio playback engine | `done` | Jules | `src/engine/audioEngine.ts` (depends on R9.4) |'
);
content = content.replace(
  '| **R10.4** | Editorial | Clip Inspector & Property Controls panel | `todo` | unclaimed | `src/components/ClipInspector.tsx` (depends on R9.5) |',
  '| **R10.4** | Editorial | Clip Inspector & Property Controls panel | `done` | Jules | `src/components/ClipInspector.tsx` (depends on R9.5) |'
);
content = content.replace(
  '| **R10.5** | Editorial | Project Document Save/Open dialogs (.cinecraft JSON) | `todo` | unclaimed | `src/services/projectPersistence.ts` (depends on R9.1) |',
  '| **R10.5** | Editorial | Project Document Save/Open dialogs (.cinecraft JSON) | `done` | Jules | `src/services/projectPersistence.ts` (depends on R9.1) |'
);

fs.writeFileSync('PROGRESS.md', content);
