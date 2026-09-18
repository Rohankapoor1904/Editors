Task: R6.7

Honest Limitations:
The implemented caption shader simulates text rendering since WebGPU WGSL doesn't have native text capabilities and a real layout engine (like HarfBuzz/FreeType) is missing per GAP_ANALYSIS. The `captionEngine` correctly throws `NotImplementedError` in `live` mode to satisfy invariant 5 (no mock data on main path) and tests execute in `demo` mode.

Changed files:
- __tests__/engine/captionEngine.test.ts
- src/__tests__/webgpuRenderer.test.ts
- src/components/ProgramMonitor.tsx
- src/engine/captions/captionEngine.ts
- src/engine/shaders/caption.wgsl
- src/engine/webgpuRenderer.ts

Verification Commands Output:

build_output.txt:
```
> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1547 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-gKBQ2b_i.css   38.63 kB │ gzip:  7.00 kB
dist/assets/index-DOTeOoal.js   263.78 kB │ gzip: 77.27 kB
✓ built in 4.35s
```

test_output.txt:
```
> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 Test Files  26 passed (26)
      Tests  119 passed | 1 skipped (120)
```

lint_output.txt:
```
> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx
```
