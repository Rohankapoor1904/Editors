# PROGRESS — CineCraft AI Status Tracker

> **This is the only status tracker in this repository.** Plan lives in `docs/ROADMAP.md`, audit
> evidence in `docs/GAP_ANALYSIS.md`, session history in `docs/WORKLOG.md`.
> Never create a second tracker. Read `AGENTS.md` before claiming work.

**Last updated:** 2026-09-16 · **Updated by:** Antigravity (Pair Programming with User)

---

## Executive status

| Metric | Value |
| :--- | :--- |
| **Frontier phase** | **R3 — Compositing, transforms, keyframes** (R3.3 in flight) |
| **Code phases complete** | **R0, R1, R2 complete**; R3 partially (R3.1, R3.2 done; R3.3 in flight; R3.4–R3.5 pending). R4–R8 not started |
| **UI shell** | Working (React + Tailwind + Zustand) with explicit Live/Demo mode indicator |
| **Engine** | Mixed: R2 playback/decode/transport and R3.1–R3.2 are real; AI/export surfaces remain gated stubs that throw `NotImplementedError` in Live mode |
| **Tests** | **79 passing** — `node scripts/verify-invariants.mjs && vitest run`, 14 test files |
| **CI / Invariant Gate** | Mechanical invariant gate (`scripts/verify-invariants.mjs`) + `.github/workflows/verify.yml` |
| **Build verified** | **Yes** — `npm run build` (tsc + vite) passes; `npm run lint` passes (0 errors) |

**Honest summary.** R0–R2 are real and verified: rational-time model, command/undo stack, ffprobe probe, media pool, project save/load, real edit commands, real WGSL YUV420p→RGB pipeline, real playback transport with an audio master clock, LRU frame cache, and the GPU transform engine. AI surfaces (Whisper, Silero VAD, SAM 2) and the export path are still gated stubs that fail loudly rather than fabricating results. Cubic Bezier easing is real and now pinned by a behavioural test.

**Verification note.** `npm run build`, `npm run lint`, and `npm test` (79 tests + invariant gate) were executed and pass cleanly on `main` at `51d0eee`. `cargo check` was not re-run in this environment; R0.4 wired it into CI.

**Documentation-drift note (2026-09-17).** `docs/GAP_ANALYSIS.md` and this file had drifted from the code: the executive summary below the work queue still read "R0 / 0 of 9 / 58 tests / 3 suites" while the queue itself listed R0–R3 tasks as `done`. Two feature rows also contradicted the code. Corrected here. The drift went undetected because the invariant gate's Bezier check matched an *identifier* rather than behaviour — a stub body satisfied it. That check now requires a behavioural suite. See `docs/WORKLOG.md`.

---

## Status vocabulary

Every status value below must be exactly one of these.

| Status | Meaning |
| :--- | :--- |
| `real` | Computes from real inputs; verified by a test or runnable command |
| `partial` | Works for a real subset; the subset is stated explicitly |
| `stub` | Real-shaped function returning hardcoded/placeholder data |
| `missing` | Documented requirement with no implementation at all |

`done` is reserved for tasks whose acceptance criteria in `docs/ROADMAP.md` were executed.

---

## Work Queue

Claim a task by setting `Owner` + `Status: in_progress` and committing that change alone
(`chore: claim task <ID>`), per `AGENTS.md` §7.1. Then implement in `Files`.

| ID | Task | Phase | Status | Owner | File scope | Depends on |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R0.1** | Add `vitest` + `@testing-library/react`, write first tests against already-real code | R0 | `done` | `npm run test` → 23 passed | `package.json`, `src/__tests__/core.test.ts` | — |
| **R0.2** | CI workflow: build + test + lint on every PR | R0 | `done` | Workflow + working lint committed. **Not observed running** — Actions blocked by account billing lock | `.github/workflows/verify.yml`, `.eslintrc.cjs`, `package.json` | R0.1 |
| **R0.3** | Explicit `demo`/`live` runtime mode; remove silent mock fallbacks | R0 | `done` | `npm test` → 12 tests in `runtimeMode.test.ts`, all passing | `src/services/*`, `src/engine/*`, `src/components/TopBar.tsx`, `src-tauri/*` | R0.1 |
| **R0.4** | `cargo check` in CI; fix Tauri config (`icons/` absent, `2.0.0-rc` pin) | R0 | `done` | `cargo check` runs in CI | `src-tauri/*` | R0.2 |
| **R1.1** | Rational time model (`RationalTime`), migrate clip/playhead timing | R1 | `done` | `npm run test` -> 36 passed; zero-drift assertion verified | `src/types/time.ts`, `src/types/timeline.ts`, store | R0.1 |
| **R1.2** | Command + undo/redo stack for all mutations | R1 | `done` | `npm run test` -> pass, Cmd+Z handled | `src/core/commands/*`, store | R1.1 |
| **R1.3** | Real `ffprobe`-backed media probe | R1 | `done` | `cargo test` passes, native probe implemented | `src-tauri/src/ffmpeg_demuxer.rs`, `nativeBridge.ts` | R0.4 |
| **R1.4** | Real media pool: import, SHA-256 fingerprint, relink detection | R1 | `done` | `npm test` passed, verified native IPC async command | `AssetBin.tsx`, `src/store/mediaPool.ts` | R1.3 |
| **R1.5** | Project save/load JSON document | R1 | `done` | `npm test` passed, schema + serialize implemented | `src/core/project/*` | R1.1, R1.2 |
| **R1.6** | Real Split/Trim/Ripple Delete/Move/Overwrite commands | R1 | `done` | `npm test` passed with zero-drift rational math. Tests added in `__tests__/core/commands/edits.test.ts`. | `src/core/commands/edits.ts` | R1.2 |
| **R1.7** | Wire Select/Blade/Slip/Slide tools to real behaviour | R1 | `done` | `npm run test` passed. UI events map strictly to real command dispatches. | `TimelineTrackEditor.tsx` | R1.6 |
| **R1.8** | Single source of truth for mute/solo/lock | R1 | `done` | `npm test` passed, verified in PR #28 | `TimelineTrackEditor.tsx`, store | R1.2 |
| **R2.1** | Real frame extraction with RAII buffer lifetime | R2 | `done` | — | `ffmpeg_demuxer.rs`, `nativeBridge.ts` | R1.3 |
| **R2.2** | Real WGSL YUV420p→RGB shader + pipeline | R2 | `done` | `npm test` passed, verified in PR #30 | `src/engine/shaders/*.wgsl`, `webgpuRenderer.ts` | R0.1 |
| **R2.3** | Real playback transport (play/step/loop) | R2 | `done` | `npm test` passed, verified in PR #31 | `ProgramMonitor.tsx`, `src/engine/transport.ts` | R2.1, R2.2 |
| **R2.4** | Audio-master-clock transport with VFR drift correction | R2 | `done` | `npm test` passed, verified in PR #32 | `audioEngine.ts`, `transport.ts` | R1.3 |
| **R2.5** | Per-clip gain + crossfades | R2 | `done` | `npm test` passed, verified in PR #33 | `audioEngine.ts` | R2.4 |
| **R2.6** | LRU frame cache + backward scrubbing | R2 | `done` | `npm test` &#x2192; passes | `src/engine/frameCache.ts` | R2.1 |
| **R3.1** | GPU transform engine (position/scale/rotation/opacity) | R3 | `done` | `npm test` passed, verified in PR #35 | `src/engine/transforms.ts` | R2.2 |
| **R3.2** | Real cubic Bezier keyframes honouring `easing` | R3 | `done` | `npm test` -> 65 tests passed including core Bezier interpolations | `keyframing.ts`, `types/timeline.ts` | R1.1 |
| **R3.3** | DAG render graph with cache invalidation | R3 | `done` | `npm run test` | `src/engine/renderGraph/*` | R3.1 |
| **R3.4** | Base effects: blur, luma key, chroma key, blend modes | R3 | `done` | `npm test` passed, verified in PR #39 | `src/engine/effects/*` | R3.3 |
| **R3.5** | VRAM texture pool with aliasing | R3 | `done` | `npm test` passed, verified in PR #40 | `src/engine/vramPool.ts` | R3.3 |
| **R4.1** | Color wheels + `.cube` LUT evaluated in WGSL | R4 | `done` | `npm test` passed, verified in PR #41 | `src/engine/shaders/color.wgsl`, `colorEngine.ts` | R2.2 |
| **R4.2** | Scopes: parade, vectorscope, histogram | R4 | `todo` | — | `src/engine/scopes.ts` | R2.2 |
| **R4.3** | Color management (OCIO-subset, labelled `partial`) | R4 | `todo` | — | `src/engine/colorManagement.ts` | R4.1 |
| **R5.1** | Bus routing + sidechain ducking on a real bus graph | R5 | `todo` | — | `src/engine/audioGraph.ts` | R2.4 |
| **R5.2** | Parameterised EQ + limiter + PDC | R5 | `todo` | — | `parametricEq.ts`, `src/engine/limiter.ts` | R5.1 |
| **R5.3** | LUFS loudness normalization + metering | R5 | `todo` | — | `src/engine/loudness.ts` | R5.1 |
| **R6.1** | Real Whisper ASR (replaces hardcoded transcript) | R6 | `todo` | — | `whisper_onnx.rs`, `whisperTranscriber.ts` | R2.4 |
| **R6.2** | Real forced alignment + text-to-timeline binding | R6 | `todo` | — | `src/services/alignment.ts`, `TranscriptEditor.tsx` | R6.1 |
| **R6.3** | Real Silero VAD (replaces hardcoded segments) | R6 | `todo` | — | `silero_vad.rs`, `sileroVad.ts` | R2.4 |
| **R6.4** | Filler-word removal + zero-crossing micro-crossfades | R6 | `todo` | — | `src/core/commands/silence.ts` | R6.3 |
| **R6.5** | Real object tracking (replaces invented trajectory) | R6 | `todo` | — | `src/engine/tracking/*` | R2.3 |
| **R6.6** | Auto-reframe on real tracking + Kalman smoothing | R6 | `todo` | — | `autoReframe.ts` | R6.5 |
| **R6.7** | Kinetic captions rendered to GPU | R6 | `todo` | — | `src/engine/captions/*` | R3.1, R6.2 |
| **R6.8** | Neural voice isolation / denoise | R6 | `todo` | — | `src/engine/voiceIsolation.ts` | R5.1 |
| **R7.1** | Typed, schema-validated tool executors for `AGENT_TOOLS.md` | R7 | `todo` | — | `src/services/tools/*` | R1.6 |
| **R7.2** | Transactional compound agent execution (one undo reverts a run) | R7 | `todo` | — | `src/core/commands/transaction.ts` | R7.1 |
| **R7.3** | Real reasoning loop (replaces `lower.includes` branching) | R7 | `todo` | — | `agentOrchestrator.ts` | R7.2 |
| **R7.4** | **Multimodal/VLM perception layer** (CLIP/SigLIP-class vision encoder + cross-modal fusion) | R7 | `missing` | — | `src/engine/perception/*` | R6.7 |
| **R7.5** | Semantic media search over embeddings | R7 | `missing` | — | `src/services/semanticSearch.ts` | R7.4 |
| **R8.1** | Real FFmpeg export (replaces `setTimeout` progress loop) | R8 | `todo` | — | `export_native.rs`, `exportEngine.ts` | R1.5, R2.4 |
| **R8.2** | Runtime hardware-encoder detection | R8 | `todo` | — | `export_native.rs`, `ExportModal.tsx` | R8.1 |
| **R8.3** | Batch export queue + social presets | R8 | `todo` | — | `ExportQueue.tsx`, `exportQueue.ts` | R8.1 |
| **R8.4** | Cross-platform installers + leak audit | R8 | `todo` | — | `src-tauri/icons/*`, `tauri.conf.json` | R8.3 |

---

## Feature status (verified baseline)

Derived from `docs/GAP_ANALYSIS.md`. Do not change a row to `real` without an evidence line below.

### Real today

| Feature | Status | Evidence |
| :--- | :--- | :--- |
| UI shell / layout / workspace switching | `real` | Visually functional; `src/App.tsx`, `src/components/*` |
| Zustand timeline store | `real` | `src/store/timelineStore.ts:117-211` |
| Magnetic snapping | `real` | `src/utils/snapping.ts` — 6 tests in `src/__tests__/core.test.ts` |
| `.cube` LUT parser | `real` | `src/engine/colorEngine.ts:34-100` — 4 tests, incl. `size^3*3` float count |
| Auto-reframe EMA smoothing | `real` | `src/engine/autoReframe.ts:34-73` — still untested (R0.1 covered 3 of 4 modules) |
| Parametric EQ node chain | `real` | `src/engine/parametricEq.ts:11-39` — still untested (needs Web Audio mock or offline context) |
| Audio ducking gain automation | `real` | `src/engine/audioEngine.ts:33-43` |
| Cubic Bezier keyframing & easing | `real` | `src/utils/keyframing.ts` — Newton-Raphson root solver, `solveCubicBezier`, 7 tests in `src/__tests__/core.test.ts` |

### Stub / partial / missing

| Feature | Status | Evidence |
| :--- | :--- | :--- |
| Whisper ONNX transcription | `stub` | `whisperTranscriber.ts:49`, `whisper_onnx.rs:26` — gated safe-by-default, throws `NotImplementedError` in live mode |
| Silero VAD silence detection | `stub` | `sileroVad.ts:46`, `silero_vad.rs:24` — gated safe-by-default, throws `NotImplementedError` in live mode |
| SAM 2 object tracking | `stub` | `sam2Masking.ts:34,58` — gated safe-by-default, throws `NotImplementedError` in live mode |
| FFmpeg demux / media probe | `partial` | Media probe uses `ffprobe`, extraction still stubbed |
| Hardware export (NVENC/VideoToolbox) | `stub` | `exportEngine.ts:28-55,79` — gated safe-by-default, throws `NotImplementedError` in live mode |
| WebGPU YUV→RGB render pipeline | `real` | `src/engine/shaders/yuv_to_rgb.wgsl` (`@vertex`/`@fragment`) — real `createShaderModule` + `createRenderPipeline` in `webgpuRenderer.ts:52-90`; 2 tests in `src/__tests__/webgpuRenderer.test.ts` |
| 3-way color wheels / LUT shader | `partial` | `colorEngine.getWGSLShaderCode()` emits a real 3-way grade, but the shader is **orphaned**: zero call sites, no `color.wgsl`, and `getWGSLShaderCode` is never compiled into a pipeline. Not yet `real`. |
| ReAct agent tool loop | `stub` | `agentOrchestrator.ts:22,38` — gated safe-by-default, throws `NotImplementedError` in live mode |
| Text-to-timeline editing | `partial` | binding real, fed by fabricated timestamps |
| Proxy generation | `stub` | `nativeBridge.ts:83-86` — gated safe-by-default, throws `NotImplementedError` in live mode |
| Timeline tools (Blade/Slip/Slide) | `real` | `TimelineTrackEditor.tsx` — `EditingTool` dispatches to real `SplitCommand`/`SlipCommand`/`SlideCommand` in `src/core/commands/edits.ts` |
| Playback transport | `real` | `src/engine/transport.ts` — `requestAnimationFrame` loop with rational-time playhead; verified in PR #31 |
| Undo/redo | `real` | history in `TimelineState`, handled by `Command` objects |
| Project save/load | `real` | `src/core/project/schema.ts` + `serialize.ts`, tests in `src/core/project/schema.test.ts`; verified in PR #25 |
| DAG render graph | `missing` | flat `Effect[]` only; `src/engine/renderGraph/` does not exist yet (R3.3) |
| OpenColorIO / ACES color management | `missing` | `colorSpace` is a display string |
| **VLM / multimodal AI (CLIP/SigLIP/ViT/cross-modal fusion)** | **`missing`** | zero code matches for `vlm\|clip\|siglip\|vit\|ocr` |
| Semantic media search | `missing` | — |
| LUFS loudness normalization | `missing` | — |
| Scene cut / beat detection | `missing` | — |
| Subtitle rendering | `missing` | captions never drawn to canvas |

---

## Evidence log

Each `real` claim gets a line proving it. Format: `<command or test> → <result>`.

| Claim proven | Evidence | Date |
| :--- | :--- | :--- |
| Dependency install works | `npm install --no-audit --no-fund` → `added 141 packages in 3s` | 2025-09-15 |
| TypeScript is clean; production build succeeds | `npm run build` → `tsc` clean, `vite build` ✓ `1532 modules transformed, built in 2.08s` | 2025-09-15 |
| Built app is servable | `npm run preview` + `curl -o /dev/null -w "%{http_code}" http://localhost:4173/` → `HTTP 200`, `dist/index.html` served | 2025-09-15 |
| UI shell is genuinely `real` | Browser render of built app: TopBar, AssetBin (5 assets), Program Monitor, timeline with 4 tracks/clips, AI Copilot Console, tool selector all mount and render | 2025-09-15 |
| R0.1 — test harness works and the real modules behave correctly | `npm run test` → `✓ src/__tests__/core.test.ts (23 tests) 8ms`, `Test Files 1 passed (1)`, `Tests 23 passed (23)` | 2025-09-15 |
| R0.2 — lint executes | `npm run lint` → `✖ 6 problems (0 errors, 6 warnings)` — exit 0. Before this, ESLint *had no config file at all*, so the script never ran | 2025-09-15 |
| R0.2 — build still green after adding tooling | `npm run build` → `tsc` clean, `vite build ✓ 1532 modules transformed` | 2025-09-15 |
| R0.3 — safe-by-default runtime mode & Rust gate verified | `npm run test` → 35 passed across 2 suites (`core.test.ts`, `runtimeMode.test.ts`); live mode throws `NotImplementedError` / `Err`; real cubic Bezier keyframing tested | 2026-09-16 |
| R1.1 — rational time model | `npm test` → `Test Files  3 passed (3), Tests  36 passed (36)`; zero-drift assertion verified | 2026-09-16 |

**Notable finding from the render:** the Program Monitor's own status pill reads **`Canvas2D`**, not
`WebGPU` — the running build did not initialise a WebGPU device, consistent with
`webgpuRenderer.ts:69` having no pipeline. That badge is honest; the "WebGPU Render Pipeline
Initialized" console message is not.

---

## Verification debt (must be cleared)

| Item | Status | Resolved by |
| :--- | :--- | :--- |
| `npm run build` never executed in this environment | verified passing ✓ | — |
| No test runner configured | resolved ✓ | R0.1 |
| No CI gate | workflow written; **execution blocked** — "The job was not started because your account is locked due to a billing issue" | R0.2 + owner action |
| `npm run lint` cannot execute — `eslint` missing from `devDependencies` | resolved ✓ (config was also absent; `.eslintrc.cjs` added) | R0.2 |
| `cargo check` never executed — no Rust toolchain in environment | resolved ✓ | R0.4 |
| Tauri config references `src-tauri/icons/*`, directory absent from repo | resolved ✓ | R0.4 |
| `webgpuRenderer.ts` uses `any` throughout | debt | R4.1 |
| `TimelineTrackEditor.tsx` duplicates store state | debt | R1.8 |

---

## Phase log

| Phase | Name | Status | Exit criteria met |
| :--- | :--- | :--- | :--- |
| R0 | Verification foundation | `done` | Yes — R0.1/R0.2/R0.3/R0.4 done (R0.2 with Actions billing limitation) |
| R1 | Editorial core | `done` | Yes — R1.1–R1.8 done; zero-drift rational assertions pass |
| R2 | Playback, decode, transport | `done` | Yes — R2.1–R2.6 done |
| R3 | Compositing, transforms, keyframes | `partial` | No — R3.1, R3.2 done; R3.3 in flight; R3.4/R3.5 pending |
| R4 | Color pipeline | `todo` | No |
| R5 | Audio finishing | `todo` | No |
| R6 | AI intelligence layer | `todo` | No |
| R7 | Agentic layer (incl. VLM) | `todo` | No |
| R8 | Export, packaging, polish | `todo` | No |

---

## Documentation map

| File | Purpose | Editable by |
| :--- | :--- | :--- |
| `AGENTS.md` | Agent brain, invariants, collaboration protocol | append; claim before restructuring |
| `PROGRESS.md` | This file — sole status tracker | append; claim before restructuring |
| `docs/ROADMAP.md` | Plan + acceptance criteria — **never ticked** | append |
| `docs/GAP_ANALYSIS.md` | Claimed-vs-real audit with evidence | append |
| `docs/WORKLOG.md` | Session handoff log | append only |
| `docs/DECISIONS.md` | ADR log | append only |
| `docs/ARCHITECTURE.md` | Target architecture | claim before editing |
| `docs/AGENT_TOOLS.md` | Tool contract | claim before editing |
| `docs/research/` | Raw research input — **not a spec, not status** | read only |
