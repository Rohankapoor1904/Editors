# Gap Analysis — Claimed vs. Actually Implemented

> **Scope.** A file-by-file, line-by-line audit of the repository at the time of the "Native Core
> Extensions" round (`b22e2897`, PR #12, 2025-09-15) against the claims made in the previous
> `PROGRESS.md` and the merged PR titles.
>
> **Method.** Every claim was checked by reading the source. Evidence is cited as `file:line`.
> No claim below is inferred from documentation — only from code.
>
> **Verification status.** Static code reading only. `npm run build` / `cargo check` were **not** run
> during this audit (no `node_modules`, no Rust toolchain invocation) — see §4.

---

## 1. Summary verdict

| Category | Count |
| :--- | :--- |
| Features claimed complete, actually **real** | 5 |
| Features claimed complete, actually **stub / mock / hardcoded** | 11 |
| Features claimed complete, **file exists but no logic at all** | 4 |
| Documented features with **no implementation trace** | all of VLM/multimodal, DAG graph, proxy, OCIO |

**Why the previous round looked complete:** every claimed feature had a file with a matching name,
a class with a matching name, a comment describing the intended behaviour, and a Tauri command
registered in `main.rs`. The *shape* of the feature was present everywhere; the *behaviour* was
present almost nowhere. Named files and descriptive comments are not implementation.

---

## 2. Claim-by-claim audit

### 2.1 Verified REAL — works as claimed

| Feature | Evidence | Notes |
| :--- | :--- | :--- |
| Component/layout shell | `src/App.tsx`, `src/components/*.tsx` | Real React + Tailwind, workspace switching works |
| Zustand timeline store | `src/store/timelineStore.ts:117-211` | Real reducers for tracks, clips, ripple delete, selection |
| Magnetic snapping | `src/utils/snapping.ts:12-51` | Real proximity math, pixel→seconds threshold, correct |
| `.cube` 3D LUT parser | `src/engine/colorEngine.ts:34-100` | Real parsing of `TITLE` / `LUT_3D_SIZE` / RGB triples |
| Auto-reframe smoothing | `src/engine/autoReframe.ts:34-73` | Real EMA filter + crop-window clamping |
| Parametric EQ wiring | `src/engine/parametricEq.ts:11-39` | Real `BiquadFilterNode` chain construction |
| Audio ducking DSP | `src/engine/audioEngine.ts:33-43` | Real `setTargetAtTime` gain automation |

### 2.2 STUB — returns hardcoded data, claims to compute

| # | Claim | Reality | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | "Integrated local Whisper ONNX speech-to-text pipeline" | Returns a **hardcoded 15-word transcript**. No ONNX runtime, no model load, no audio read. Same fake transcript on both sides of the IPC boundary. | `src/services/whisperTranscriber.ts:49-65`; `src-tauri/src/whisper_onnx.rs:26-43` |
| 2 | "Integrate local Silero VAD for silence detection" | Returns **two hardcoded silence segments** (5.0–7.5s, 18.2–19.8s) regardless of input. | `src/services/sileroVad.ts:46-47`; `src-tauri/src/silero_vad.rs:24-36` |
| 3 | "Integrate SAM 2 (Segment Anything) object tracking" | Single-frame mask is a **1×1 transparent PNG data URI**. Sequence tracking invents a trajectory with `Math.sin(i * 0.1) * 3`. No model, no inference. | `src/engine/sam2Masking.ts:34`, `:58`, `:70` |
| 4 | "Build C++/Rust FFmpeg demuxing engine wrapper" | `probe_file` returns **fixed** `3840×2160 @ 59.94fps, 124.5s, h264` for any path. `extract_frames` synthesises frame metadata; no byte buffer is ever read. `filename` is derived from the string, nothing is opened. | `src-tauri/src/ffmpeg_demuxer.rs:44-48`, `:61-77` |
| 5 | "Integrate NVIDIA NVENC and Apple VideoToolbox hardware exporters" | Only **builds an FFmpeg argument array**. Nothing is executed. The engine then runs a `setTimeout` loop stepping 0→100% and reports success. | `src/engine/exportEngine.ts:28-55`, `:79-84` |
| 6 | "32-bit Float 3-Way Color Wheels & .cube LUT WebGPU shader" | **Corrected during follow-up verification.** A full WGSL fragment shader *does* exist: `colorEngine.getWGSLShaderCode()` emits a 3-way grade — temperature/tint, lift, gamma, gain, offset, contrast, saturation, and conditional trilinear LUT sampling. The earlier claim in this table that "no WGSL exists anywhere in the repo" was **wrong** and is retracted. The real defect is narrower but still fatal: the shader is **orphaned**. `getWGSLShaderCode` has **zero call sites** (`grep -rn getWGSLShaderCode src` returns only its definition), there is **no `createShaderModule`** anywhere in the codebase, and `renderFrame` opens a render pass and ends it with no pipeline. So the shader is never compiled and never reaches the GPU — it is `partial`, not `missing`. | `src/engine/colorEngine.ts:83-134` (shader source); `src/engine/webgpuRenderer.ts:54,70` (`createCommandEncoder` → `passEncoder.end()`, nothing between) |
| 7 | "WebGPU YUV420p-to-RGB color conversion pipeline" | No YUV conversion code. No texture upload. `lutIntensity` is accepted in `RenderOptions` and never read. | `src/engine/webgpuRenderer.ts:1-6`, `:59-71` |
| 8 | "Connect ReAct agent tool loop" | Two `if (lower.includes(...))` branches. No LLM, no tool schema, no planning, no tool-call validation. The tool specs in `docs/AGENT_TOOLS.md` are never referenced by code. | `src/services/agentOrchestrator.ts:22`, `:38` |
| 9 | "Bi-directional text-to-timeline editing binding" | Transcript words are **hardcoded by #1**, so deleting a word ripples a range derived from fabricated timestamps. The direction works; the data is fiction. | `src/components/TranscriptEditor.tsx:14-17`, `:39-51` |
| 10 | "Bezier keyframe interpolator" | Function name and interface promise cubic Bezier; body is **linear only**. `Keyframe.easing` is declared in the type and never read. | `src/utils/keyframing.ts:26-28`; `src/types/timeline.ts:11-15` |
| 11 | "Background proxy generation" | Logs a line and returns `` `${path}.proxy.mp4` ``. No transcode, no file. | `src/services/nativeBridge.ts:83-86` |

### 2.3 FILE EXISTS, NO LOGIC — controlled vocabulary for agents

Use these exact terms in `PROGRESS.md` so status is unambiguous:

- **`real`** — computes something from real inputs; verified by test or demo.
- **`stub`** — a real-shaped function returning hardcoded/placeholder data.
- **`missing`** — documented feature with no implementation file at all.
- **`partial`** — works for a real subset; must state exactly which subset.

| Documented feature | Status | Evidence |
| :--- | :--- | :--- |
| VLM / multimodal AI (GPT-4V, ViT, CLIP/SigLIP embeddings, cross-modal attention) | **missing** | `grep -rni "vlm\|clip\|siglip\|vit\|vision transformer\|ocr"` → zero code matches. Described only in `docs/research/deep-research-02-*` §22 and `deep-research-01-*` §814/§1144. |
| DAG render graph / compositing scheduler | **missing** | No evaluator, no node graph. Only flat `Effect[]` on clips. |
| OpenColorIO / ACEScg color management | **missing** | `colorSpace: 'Rec.709'` is a display string only. |
| Proxy media pipeline + online conform | **missing** | See 2.2 #11. |
| Undo/redo command stack | **missing** | `TimelineState` has no history; mutations write directly to the store. |
| Project save/load (JSON schema) | **missing** | No serializer. `TimelineState` is in-memory only; no `saveProject`/`loadProject`. |
| OpenTimelineIO interchange | **missing** | No adapter, no dependency. |
| LRU scrubbing frame cache | **missing** | No cache layer. |
| VRAM texture pool | **missing** | No pool; renderer allocates nothing. |
| Loudness normalization (BS.1770-4) | **missing** | No LUFS meter. |
| Beat/tempo sync, scene cut detection | **missing** | No implementation. |
| Text layout engine (HarfBuzz/FreeType), subtitle rendering | **missing** | Captions are never rendered to canvas. `add_subtitles` in `docs/AGENT_TOOLS.md` has no executor. |

### 2.4 Wired-but-inert surfaces

| Surface | Problem |
| :--- | :--- |
| Timeline tool selector | Buttons exist for Select/Blade/Slip/Slide and set `activeTool` state (`TimelineTrackEditor.tsx:48`, `:85-110`), but the value is **only** read for button highlighting (`:103`). No clip interaction consults it — no tool has behaviour. |
| Play transport | Play button toggles `isPlaying` icon state; no playback loop advances the playhead or pulls frames. |
| Import media | `importMediaFile()` prefers Tauri IPC, which calls `probe_file` → always the same fake metadata. Browser fallback is also fake. |
| Export modal | Encoder info hardcoded to `"Apple VideoToolbox / NVENC GPU"` regardless of host platform (`ExportModal.tsx`), then reports success from the fake loop. |
| Track mute/solo/lock | Local `useState` in the component (`TimelineTrackEditor.tsx:49-54`) is **not** the store's `Track.muted/locked/solo`. Two sources of truth for the same state. |

---

## 3. Why this happened (root causes, so it does not repeat)

1. **Output-shaped milestones.** Each phase's definition of done was "a file with this name exists",
   so files and interfaces were produced, behaviour was not.
2. **No test infrastructure.** Nothing could fail, so nothing was caught. Zero test files, no runner
   in `package.json`.
3. **No CI.** PRs merged on the strength of titles. "Complete Phase 5 … 100% Roadmap Completion"
   merged without a build gate.
4. **Documentation written from the plan, not from the code.** `PROGRESS.md` reproduced the roadmap's
   optimism instead of recording what shipped.
5. **Duplicate trackers.** `PROGRESS.md` (100%) and `docs/TIER1_DESKTOP_APP_ROADMAP.md` (0%) coexisted
   and contradicted each other; whichever a reader opened first became "the status".
6. **Plausible mocks.** Return values were chosen to look realistic (59.94 fps, 3840×2160, `0.96`
   confidence), so the fakes survived casual inspection.

---

## 4. Verification status of this audit

Stated explicitly so no reader over-trusts §2:

- **Executed in the audit session (pass):** `npm install`, `npm run build` (`tsc` clean + `vite build`,
  1532 modules, 2.08s), `npm run preview` + `curl` → `HTTP 200`, and a browser render of the built app.
  The build result is meaningful: TypeScript across the existing code is **clean**, so the inert
  surfaces in §2.4 are behavioural gaps, not compile errors.
- **Browser render confirmed** the UI shell mounts fully (TopBar, AssetBin with 5 assets, Program
  Monitor, 4-track timeline with clips, AI Copilot Console, tool selector).
- **Browser render additionally showed** the Program Monitor's own status pill reading **`Canvas2D`**
  rather than `WebGPU` — the running build initialised no WebGPU device. This independently corroborates
  §2.2 #6/#7: there is no **working** WebGPU pipeline. The badge is honest; the
  "WebGPU Render Pipeline Initialized" console message is not.

- **Correction to an earlier draft of this audit.** The first version of §2.2 #6 claimed "no WGSL
  exists anywhere in the repo". Follow-up verification found that claim to be **false** and it has been
  retracted in place. `colorEngine.ts:83-134` contains a complete WGSL fragment shader. The accurate
  finding is that the shader is **orphaned** — zero call sites, no `createShaderModule`, so it never
  compiles. This is recorded here rather than silently fixed because the audit's whole purpose is to
  establish that claims must be checked against code, and that applies to this document too. Any reader
  should treat any remaining unverified claim in §2 as a hypothesis, not a fact.
- **`npm run lint` FAILS to execute:** `sh: 1: eslint: not found`. `eslint` is invoked by the script
  but is absent from `devDependencies`. Recorded as verification debt (R0.2).
- **`cargo check` was NOT executed** — no Rust toolchain in the audit environment. The Rust modules may
  or may not compile; `tauri 2.0.0-rc` plus the `icons/` referenced in `src-tauri/tauri.conf.json` (the
  directory does not exist in the repo) make a successful build unlikely without changes.
- **All §2.2 mock findings are from reading return statements**, not from runtime interception. For
  hardcoded returns this is unambiguous, but no test currently proves them; that is exactly what
  task **R0.1** introduces.

---

## 5. What must change structurally

1. **One tracker, one roadmap** — done. `PROGRESS.md` is the only status file; the duplicate roadmap
   was deleted and its content replaced by `docs/ROADMAP.md`.
2. **A status vocabulary** — `real` / `stub` / `partial` / `missing`, used in `PROGRESS.md` (see §2.3).
   "Done" is no longer a status a human or agent may self-assign without acceptance evidence.
3. **Tests before features** — R0.1/R0.2 gate everything else.
4. **Fail loudly** — mocks must be deleted from main paths or gated behind an explicit
   `demo mode` flag, never silently substituted (invariant §5.5 of `AGENTS.md`).
5. **Evidence lines** — every `done` row in `PROGRESS.md` carries the command or test that proves it.
