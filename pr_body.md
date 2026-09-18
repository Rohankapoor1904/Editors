Task: R6.6

### Verification Command Outputs

**Build Output (`npm run build`)**:
```
> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1545 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-gKBQ2b_i.css   38.63 kB │ gzip:  7.00 kB
dist/assets/index-YqJPjRtC.js   261.27 kB │ gzip: 76.47 kB
✓ built in 3.80s
```

**Test Output (`npm run test`)**:
```
> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 ✓ src/engine/audioEngine.test.ts (4 tests) 26ms
 ✓ __tests__/core/commands/edits.test.ts (8 tests) 17ms
 ✓ src/__tests__/core.test.ts (23 tests | 1 skipped) 13ms
 ✓ src/__tests__/vramPool.test.ts (7 tests) 12ms
 ✓ src/core/project/schema.test.ts (3 tests) 8ms
 ✓ src/engine/effects/baseEffects.test.ts (6 tests) 17ms
 ✓ src/__tests__/keyframing.behavior.test.ts (14 tests) 12ms
 ✓ src/__tests__/alignment.test.ts (4 tests) 9ms
 ✓ src/__tests__/runtimeMode.test.ts (12 tests) 15ms
 ✓ src/engine/frameCache.test.ts (4 tests) 7ms
 ✓ src/__tests__/audioMasterClock.test.ts (1 test) 107ms
 ✓ src/engine/parametricEq.test.ts (3 tests) 9ms
 ✓ src/__tests__/RenderGraph.test.ts (2 tests) 5ms
 ✓ src/__tests__/webgpuRenderer.test.ts (2 tests) 11ms
 ✓ src/__tests__/commands.test.ts (2 tests) 7ms
 ✓ src/engine/audioGraph.test.ts (2 tests) 10ms
 ✓ src/engine/scopes.test.ts (3 tests) 10ms
 ✓ src/__tests__/autoReframe.test.ts (2 tests) 26ms
 ✓ src/__tests__/transforms.test.ts (3 tests) 11ms
 ✓ src/core/commands/audio.test.ts (2 tests) 6ms
 ✓ src/engine/colorManagement.test.ts (4 tests) 7ms
 ✓ src/__tests__/rationalTime.test.ts (1 test) 6ms
 ✓ src/engine/limiter.test.ts (2 tests) 8ms
 ✓ src/engine/loudness.test.ts (2 tests) 42ms
 ✓ src/utils/audio.test.ts (2 tests) 3ms

 Test Files  25 passed (25)
      Tests  117 passed | 1 skipped (118)
   Start at  03:37:14
   Duration  3.37s (transform 833ms, setup 0ms, collect 1.49s, tests 403ms, environment 6ms, prepare 2.04s)
```

**Lint Output (`npm run lint`)**:
```
> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx

```

### Changed Files
- `src/engine/autoReframe.ts`
- `src/__tests__/autoReframe.test.ts`

### Honest Limitations
- The 1D Kalman filter only tracks subject X position. If vertical tracking/panning becomes a requirement in the future, it will need to be extended to a 2D filter (X, Y).
- The prediction model uses simple velocity and assumes constant fps. If the actual tracking output drops frames sporadically, timestamps dt might fluctuate, but the current `dt` clamping ensures robustness.

