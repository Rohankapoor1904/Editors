Task: R2.5

```
> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1540 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-B9mlqUBh.css   37.36 kB │ gzip:  6.87 kB
dist/assets/index-zdUYfJod.js   248.20 kB │ gzip: 72.41 kB
✓ built in 3.58s

> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 ✓ src/core/project/schema.test.ts (3 tests) 10ms
 ✓ __tests__/core/commands/edits.test.ts (8 tests) 12ms
 ✓ src/__tests__/core.test.ts (23 tests) 14ms
 ✓ src/__tests__/commands.test.ts (2 tests) 8ms
 ✓ src/__tests__/runtimeMode.test.ts (12 tests) 18ms
 ✓ src/__tests__/audioMasterClock.test.ts (1 test) 119ms
 ✓ src/__tests__/webgpuRenderer.test.ts (2 tests) 11ms
 ✓ src/engine/audioEngine.test.ts (2 tests) 12ms
 ✓ src/core/commands/audio.test.ts (2 tests) 6ms
 ✓ src/__tests__/rationalTime.test.ts (1 test) 7ms
 ✓ src/utils/audio.test.ts (2 tests) 4ms

 Test Files  11 passed (11)
      Tests  58 passed (58)
   Start at  22:46:01
   Duration  1.88s (transform 588ms, setup 0ms, collect 1000ms, tests 221ms, environment 4ms, prepare 1.08s)

> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx
```

### Changed Files
- `src/core/commands/audio.test.ts`
- `src/core/commands/audio.ts`
- `src/core/commands/index.ts`
- `src/engine/audioEngine.test.ts`
- `src/engine/audioEngine.ts`
- `src/utils/audio.test.ts`
- `src/utils/audio.ts`

### Honest Limitations
- The `ApplyCrossfadeCommand` handles timeline mutation by creating an `audioEffect` object attached to the right clip, simulating a transition logic since the `TimelineState` and UI are not fully equipped with transition rendering or distinct transition blocks between clips.
- `ApplyCrossfadeCommand` and `applyCrossfade` are correctly built to do DSP scheduling but are currently uncoupled from the global transport playback loop (`transport.ts`) because the transport does not yet have an architecture to poll and trigger DSP events based on imminent overlapping properties during loop playback.
