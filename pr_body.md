Task: R9.2

Verified build, test, and lint commands cleanly.

### Files changed:
- src/components/AssetBin.tsx
- src/components/TimelineTrackEditor.tsx
- src/components/__tests__/AssetBin.test.tsx
- src/components/__tests__/TimelineTrackEditor.test.tsx

### Honest Limitations:
- The drag and drop native file API was partially simulated using a hidden file input (for clicking import natively) and web object URLs for the media preview and dimensions parsing. In a full Tauri environment, it should use Rust backend to decode accurate frames for scrubbing. It correctly simulates duration detection using an in-memory Audio/Video element.

### Output:
```
BUILD:

> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1553 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-8zzvL1Nr.css   39.32 kB │ gzip:  7.18 kB
dist/assets/index-BxAyYUi-.js   278.27 kB │ gzip: 81.78 kB
✓ built in 3.78s

TEST:

> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 Test Files  36 passed (36)
      Tests  148 passed | 1 skipped (149)
   Start at  14:16:55
   Duration  19.36s (transform 1.27s, setup 4.53s, collect 2.54s, tests 2.02s, environment 35.77s, prepare 3.05s)


LINT:

> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx
```
