Task: R9.2

Verified build, test, and lint commands cleanly.

### Files changed:
- src/components/AssetBin.tsx
- src/components/TimelineTrackEditor.tsx
- src/components/__tests__/AssetBin.test.tsx
- src/components/__tests__/TimelineTrackEditor.test.tsx

### Honest Limitations:
- The drag and drop native file API was partially simulated using a hidden file input (for clicking import natively) and web object URLs for the media preview and dimensions parsing. In a full Tauri environment, it should use Rust backend to decode accurate frames for scrubbing. It correctly simulates duration detection using an in-memory Audio/Video element.
