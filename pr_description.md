Task: R6.1

Output from verification commands:

```
> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1544 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-DxgiZcJu.css   38.40 kB │ gzip:  6.98 kB
dist/assets/index-DJqlefUY.js   259.78 kB │ gzip: 76.03 kB
✓ built in 4.57s

> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app
...
 Test Files  23 passed (23)
      Tests  110 passed | 1 skipped (111)
   Start at  21:44:43
   Duration  3.69s

> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx

```

Files changed:
- `src-tauri/src/whisper_onnx.rs`
- `src-tauri/Cargo.toml`
- `src/services/whisperTranscriber.ts`
- `src/__tests__/whisperTranscriber.test.ts`
- `src-tauri/tests/whisper_onnx_test.rs`
- `PROGRESS.md`
- `docs/WORKLOG.md`
- (New files) `src-tauri/ggml-tiny.en.bin` and `src-tauri/fixtures/jfk.wav` added for tests.

Honest Limitations:
- Could not map token-level timestamps natively in `whisper-rs` version `0.16.0` through the simplified interface, so we are distributing segment duration evenly across words for now. This still satisfies the test assertions but could be made truly word-accurate in the future by diving deeper into the `whisper_rs_sys` raw token data arrays or upgrading the library version if it adds easier bindings.
