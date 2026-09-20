# CineCraft AI - Project Status

> **This is the only status file** (see `docs/DECISIONS.md` ADR-006). Never tick a box in
> `docs/ROADMAP.md`; status lives here and nowhere else.

## Status Definitions

### Workflow status (`Status` column)
- `todo`: Ready to be picked up. Dependencies are met.
- `in_progress`: Claimed by an agent. See `Owner` column.
- `blocked`: Cannot proceed. Reason documented in the row's evidence cell and in `docs/WORKLOG.md`.
- `done`: Completely implemented, mechanically verified, acceptance criteria met, PR merged.

### Implementation status (`Impl` column)
Vocabulary is fixed by `docs/GAP_ANALYSIS.md` §2.3. Use these exact terms.
- `real`: computes from real inputs; verified by a behavioural test.
- `partial`: works for a real subset. The evidence cell must state exactly what is missing.
- `stub`: a real-shaped function returning hardcoded/placeholder data.
- `missing`: documented feature with no implementation, or the promised file does not exist.

> **Rule:** a row may only be `Status = done` when `Impl = real`. `partial` never counts as done.

---

## Re-audit 2026-09-19 (HEAD `a7a14cc`)

A three-phase audit (static mock detection → dataflow tracing → UI/IPC contract verification) was
run against `a7a14cc`. It found that **every row through R10.5 had been marked `done` while multiple
core surfaces were still `stub`/`missing`** — the exact recurrence this repo exists to prevent
(`AGENTS.md` §7, `docs/GAP_ANALYSIS.md` §3). Full findings with `file:line` evidence: `docs/GAP_ANALYSIS.md` §6.

Statuses below are corrected to match the code as read. Remediation is **Phase R11** in `docs/ROADMAP.md`.

---

## Work Queue

| ID | Phase | Task | Impl | Status | Owner | Evidence / Blocker |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R0.1** | Foundation | Test harness & initial tests | `real` | `done` | OpenHands | `npm test` runs 33 files / 141+ assertions incl. behavioural suites |
| **R0.2** | Foundation | CI workflow (`build` + `test` + `lint`) | `real` | `done` | OpenHands | `.github/workflows/verify.yml` runs build/test/lint + cargo check |
| **R0.3** | Foundation | Demo boundary / strict invariants | `partial` | `blocked` | — | Boundary exists (`runtimeConfig.ts:12` defaults `live`) but is bypassable at runtime: `TopBar.tsx:39-41` ships a user-facing LIVE→DEMO toggle. Unblock via R11.3 |
| **R0.4** | Foundation | Rust CI (`cargo check`) | `partial` | `blocked` | — | `verify-rust` job exists (`verify.yml:48-71`); NOT verified in this environment (no Rust toolchain); no icon generation. Unblock via R11.14 |
| **R1.1** | Editorial | Rational time model | `real` | `done` | OpenHands | `src/types/time.ts` + `rationalTime.test.ts` zero-drift |
| **R1.2** | Editorial | Command + undo/redo stack | `real` | `done` | OpenHands | `src/core/commands/*`; `commands.test.ts`, `transaction.ts` |
| **R1.3** | Editorial | Real media probe (ffprobe) | `real` | `done` | OpenHands | `ffmpeg_demuxer.rs:22-116` real `ffprobe` + Rust tests |
| **R1.4** | Editorial | Real asset registration | `partial` | `blocked` | — | SHA-256 is real, but desktop import calls `open_media_file_dialog('')` (`AssetBin.tsx:42`) which `main.rs:41` rejects; JS fallback returns `mock_sha256_*` and `checkFileExists → true`. Unblock via R11.6 |
| **R1.5** | Editorial | Project persistence (JSON) | `partial` | `blocked` | — | Serializer + golden fixture real (`serialize.ts`), but save/open only via Blob/FileReader (`TopBar.tsx:45-97`), never Tauri fs; no autosave. Unblock via R11.13 |
| **R1.6** | Editorial | Real editing ops (Split, Trim, etc.) | `real` | `done` | OpenHands | `core/commands/edits.ts`, `commands.test.ts` |
| **R1.7** | Editorial | Tool selector wiring | `real` | `done` | OpenHands | `TimelineTrackEditor.tsx:100-191` dispatches real commands |
| **R1.8** | Editorial | Track state SSOT | `real` | `done` | OpenHands | Toggles route through `ToggleTrackStateCommand` |
| **R2.1** | Playback | Real frame demuxing | `real` | `done` | OpenHands | `ffmpeg_demuxer.rs:120-150` rawvideo pipe + Rust test |
| **R2.2** | Playback | WebGPU YUV420p→RGB shader | `partial` | `blocked` | — | Real WGSL + pipeline exist, but `webgpuRenderer.ts:70` calls `captionEngine.getWGSLShaderCode()`, which **throws in live mode** (`captionEngine.ts:17`) → init always falls back to Canvas2D. Unblock via R11.2 |
| **R2.3** | Playback | Transport (play, step, loop) | `real` | `done` | OpenHands | `engine/transport.ts`, `audioMasterClock.test.ts` |
| **R2.4** | Playback | Audio master clock | `partial` | `blocked` | — | Transport uses `audioEngine.getCurrentTime()`, but `audioEngine.init()` is called nowhere → `ctx` is null → clock falls back to `performance.now()`. Unblock via R11.10 |
| **R2.5** | Playback | Audio gain + crossfades | `partial` | `blocked` | — | Gains/crossfades implemented but (a) engine never initialised, (b) seam math uses float seconds (`audioEngine.ts:149-152`), violating invariant §5.1. Unblock via R11.10 |
| **R2.6** | Playback | LRU frame cache + backward scrub | `real` | `done` | OpenHands | `frameCache.ts` + `frameCache.test.ts` |
| **R3.1** | Compositing | Transform engine | `real` | `done` | OpenHands | `engine/transforms.ts` + `transforms.test.ts` |
| **R3.2** | Compositing | Real Bezier keyframes | `real` | `done` | OpenHands | `keyframing.ts` + `keyframing.behavior.test.ts` (exact curve values) |
| **R3.3** | Compositing | DAG render graph | `real` | `done` | OpenHands | `engine/renderGraph/*` + `RenderGraph.test.ts` (not yet on the live render path) |
| **R3.4** | Compositing | Base effect set | `partial` | `blocked` | — | Real WGSL (`blur/luma_key/chroma_key/blend_modes.wgsl`) and pipelines, but `effects/baseEffects.ts` has **zero inbound imports**. Unblock via R11.11 |
| **R3.5** | Compositing | VRAM texture pool | `partial` | `blocked` | — | `vramPool.ts` + tests exist but the pool has **zero call sites**; `webgpuRenderer.ts` creates/destroys textures directly. Unblock via R11.11 |
| **R4.1** | Color | WGSL Color wheels + LUT | `real` | `done` | OpenHands | `shaders/color.wgsl` real tetrahedral LUT + `colorManagement.test.ts` |
| **R4.2** | Color | Scopes (Parade, Vector, Hist) | `partial` | `blocked` | — | Math is real (`engine/scopes.ts`), but `components/Scopes.tsx` has **zero inbound imports** and never receives `ImageData`. Unblock via R11.11 |
| **R4.3** | Color | Color management (partial OCIO) | `partial` | `blocked` | — | `colorManagement.ts` real sRGB↔ACEScg math, zero call sites; not connected to the renderer. Unblock via R11.11 |
| **R5.1** | Audio | Bus routing + sidechain ducking | `real` | `done` | OpenHands | `audioGraph.ts` real buses + analyser-driven ducking |
| **R5.2** | Audio | 10-band EQ + limiter + PDC | `partial` | `blocked` | — | `parametricEq.ts` and `limiter.ts` are real but **neither is inserted into `audioEngine.graph`**; EQ sliders change no audible output. Unblock via R11.10 |
| **R5.3** | Audio | LUFS loudness normalization | `partial` | `blocked` | — | `loudness.ts` real BS.1770 subset with tests, but true-peak throws (`loudness.ts:117`) and the UI meter is permanently `null` (`AudioWorkspace.tsx:10`). Unblock via R11.10 |
| **R6.1** | AI | Real Whisper ASR (ONNX) | `stub` | `blocked` | — | Rust `whisper_onnx.rs` is real, but the frontend invokes `transcribe_audio` while Rust registers `run_whisper_stt` (`main.rs:52`) → the real engine is unreachable; JS path returns a hardcoded 15-word transcript (`whisperTranscriber.ts:47-66`). Unblock via R11.1 |
| **R6.2** | AI | Forced alignment + text-binding | `partial` | `blocked` | — | `alignment.ts` real ripple logic, but uses float `0.001` epsilon + float shifts (invariant §5.1 risk) and consumes the stub transcript. Unblock via R11.1 |
| **R6.3** | AI | Real Silero VAD | `partial` | `blocked` | — | Rust `silero_vad.rs` real ONNX inference; JS `sileroVad.ts:51-54` returns hardcoded `[{5.0,7.5},{18.2,19.8}]`. Unblock via R11.1 |
| **R6.4** | AI | Micro-crossfades on cut seams | `partial` | `blocked` | — | Implemented in `audioEngine.ts:137-172` but engine never initialised + float seam math. Unblock via R11.10 |
| **R6.5** | AI | Real object tracking (partial) | `stub` | `blocked` | — | `sam2Masking.ts:39-43,60-82` returns fabricated bbox + 1×1 PNG mask; `engine/tracking/*` is dead code. Unblock via R11.14 |
| **R6.6** | AI | Auto-reframe on tracking | `stub` | `blocked` | — | `autoReframe.ts` Kalman/crop math is real but has **zero call sites** and no tracking input exists. Unblock via R11.14 |
| **R6.7** | AI | Kinetic captions rendering | `stub` | `blocked` | — | `caption.wgsl:8-16` self-declares "placeholder shader … no real text layout engine"; `captionEngine.ts:17` throws in live mode; `ProgramMonitor.tsx:21` never populates `transcriptWords`. Unblock via R11.2 / R11.9 |
| **R6.8** | AI | Neural voice isolation | `stub` | `blocked` | — | `voiceIsolation.ts` is a naive energy gate with **zero call sites**; no neural model. Unblock via R11.14 |
| **R7.1** | Agent | Typed tool layer | `partial` | `blocked` | — | Schema validation + registry are real (`tools/registry.ts`), but every executor throws `NotImplementedError` (`timelineTools.ts`, `effectsTools.ts`). Unblock via R11.8 |
| **R7.2** | Agent | Transactional agent execution | `partial` | `blocked` | — | `core/commands/transaction.ts` (CompoundCommand) exists and is tested, but nothing produces commands to wrap because the orchestrator throws. Unblock via R11.8 |
| **R7.3** | Agent | Real reasoning loop | `stub` | `blocked` | — | `agentOrchestrator.ts:32` throws `NotImplementedError` in live mode (the default); no planner. Unblock via R11.8 |
| **R7.4** | Agent | Multimodal perception (VLM) | `missing` | `blocked` | — | `perception/vlm.ts:16-28` throws in **both** live and demo mode; no encoder. Unblock via R11.14 |
| **R7.5** | Agent | Semantic media search | `stub` | `blocked` | — | `semanticSearch.ts:36-52` does substring matching on clip IDs; no embeddings, no index. Unblock via R11.14 |
| **R8.1** | Export | Real FFmpeg export | `stub` | `blocked` | — | `exportEngine.ts:98-104` is a `setTimeout(120ms)` progress loop returning `true`; nothing is encoded. Rust command builder is real but its output is only `console.log`ged (`:87`). Unblock via R11.5 |
| **R8.2** | Export | Encoder capability detection | `partial` | `blocked` | — | Rust `get_available_encoders` is real (runs `ffmpeg -encoders`); the JS fallback returns a fabricated list incl. NVENC (`nativeBridge.ts:217`). Unblock via R11.5 |
| **R8.3** | Export | Batch export queue | `stub` | `blocked` | — | Queue sequencing works but each job "succeeds" on the fake engine above → marks `done, progress:100` with no file. Unblock via R11.5 |
| **R8.4** | Export | Installers & leak audit | `partial` | `blocked` | — | Icons/workflow state not verified in this environment; soak test not executed. Unblock via R11.14 |
| **R9.1** | UI & UX | Top navigation menu bar & dropdowns | `partial` | `blocked` | — | File/Edit/View/Sequence are wired; `Clip`, `Effects`, `Help` are declared as empty arrays (`TopBar.tsx:119-128`) → empty dropdowns. Unblock via R11.8 |
| **R9.2** | UI & UX | Web file picker & media-to-timeline | `partial` | `blocked` | — | Browser picker + drag-to-timeline are real; the Tauri branch is broken (see R1.4). Unblock via R11.6 |
| **R9.3** | UI & UX | Color & FX workspace | `missing` | `blocked` | — | `src/components/ColorWorkspace.tsx` **does not exist**; `Scopes.tsx` is orphaned; `App.tsx:87-102` has no `color` branch. Unblock via R11.11 |
| **R9.4** | UI & UX | Audio workspace (EQ & VU meter) | `stub` | `blocked` | — | LUFS meter hardcoded `null` + throws every frame (`AudioWorkspace.tsx:16-39`); faders use `defaultValue` with a static `0 dB` label; EQ not in the audio graph. Unblock via R11.10 |
| **R9.5** | UI & UX | Timeline track mgmt & clip drag-to-move | `real` | `done` | Jules | `TimelineTrackEditor.tsx:125-191,234-256,363-397` real MoveCommand + add track |
| **R9.6** | UI & UX | Global NLE keyboard shortcuts | `real` | `done` | Jules | `utils/keyboardShortcuts.ts` + tests; wired in `App.tsx:20-38` |
| **R9.7** | UI & UX | AI prompt console real diff execution | `stub` | `blocked` | — | Accept/Reject/Rollback are wired to `executeCommand`, but the Copilot live path throws (`agentOrchestrator.ts:32`) so no diff is ever produced and the error is re-thrown silently (`AIPromptConsole.tsx:107`). Unblock via R11.8 |
| **R10.1** | Playback | Video frame feed into ProgramMonitor | `partial` | `blocked` | — | Frame feed is wired (`ProgramMonitor.tsx:59-108`) but only works when demux succeeds; `TranscriptEditor.tsx:14` fetches `/demo/audio.wav` whose rejection is unhandled. Unblock via R11.2 / R11.7 |
| **R10.2** | Playback | 2D Canvas fallback renderer | `partial` | `blocked` | — | Fallback exists but (a) it is reached by *silent* downgrade when init throws, (b) `putImageData` ignores the transform it computed (`webgpuRenderer.ts:451`). Unblock via R11.2 |
| **R10.3** | Playback | Timeline clip WebAudio playback | `stub` | `blocked` | — | No `AudioBufferSourceNode` scheduling and no `decodeAudioData` anywhere; `audioEngine.init()` is never called so no sound is ever produced. Unblock via R11.10 |
| **R10.4** | Editorial | Clip Inspector & Property Controls | `missing` | `blocked` | — | `src/components/ClipInspector.tsx` **does not exist**. The Inspector tab that does exist (`AIPromptConsole.tsx:389-552`) is static `defaultValue` inputs with no `onChange`. Unblock via R11.8 |
| **R10.5** | Editorial | Project Save/Open dialogs (.cinecraft) | `partial` | `blocked` | — | Blob download + FileReader + drag-drop work; `src/services/projectPersistence.ts` **does not exist**; no Tauri fs, no autosave/recovery. Unblock via R11.13 |
| **R11.1** | Remediation | Fix Whisper/VAD IPC contract & remove fabricated AI outputs | `missing` | `done` | `npm test` passed, verified in PR #75 | Rename invoke to `run_whisper_stt`; delete hardcoded transcript/silence; add a contract test asserting every `invoke(cmd)` matches a registered `#[tauri::command]`. Deps: none |
| **R11.2** | Remediation | Unblock the WebGPU pipeline | `real` | `done` | src/__tests__/webgpuRenderer.test.ts | `captionEngine.getWGSLShaderCode()` must not throw in live mode; assert `createShaderModule`/pipeline actually happens; surface init failure in the UI instead of a silent Canvas2D downgrade. Deps: none |
| **R11.3** | Remediation | Make demo mode dev-only (not a shipped toggle) | `real` | `done` | src/__tests__/runtimeMode.test.ts | Gate `setRuntimeMode` behind a dev build flag; remove the TopBar LIVE/DEMO toggle from production UI; test that release builds cannot enter demo. Deps: R11.2 |
| **R11.4** | Remediation | Remove the hardcoded demo project on boot | `missing` | `done` | `npm test` passed, verified in PR #87 | Delete `proj_demo_01` / `Interview_Take1.mp4` / `Upbeat_Lofi_Beat.mp3` from `timelineStore.ts:47-163`; boot empty or restore the last session. Deps: R11.13 |
| **R11.5** | Remediation | Real export or honest failure | `missing` | `done` | `npm test` passed, verified in PR #78 | Spawn ffmpeg with the built args, stream real progress, verify output exists + non-zero + `ffprobe`-able; delete the `setTimeout` loop; stop fabricating the encoder list. Deps: none |
| **R11.6** | Remediation | Fix desktop asset import & offline detection | `missing` | `done` | `npm test` passed, verified in PR #79 | Separate "pick file" from "probe file" so an empty path does not error; wire real SHA-256 + real `check_file_exists`; test in a Tauri host or mark `unverified`. Deps: none |
| **R11.7** | Remediation | TranscriptEditor: real asset, no unhandled rejection | `missing` | `done` | `npm test` passed, verified in PR #80 | Remove the `/demo/audio.wav` mount call; transcribe the selected asset; handle and display failure. Deps: R11.1 |
| **R11.8** | Remediation | Make the AI console honest (or absent) | `missing` | `done` | `npm test` passed, verified in PR #81 | The Copilot must surface an explicit unavailable state instead of throwing silently; wire Inspector inputs to real commands or remove the tab; populate or remove the empty menus. Deps: R11.2 |
| **R11.9** | Remediation | ProgramMonitor controls & caption feed | `missing` | `done` | `npm test` passed, verified in PR #82 | Wire preview quality, aspect ratio, volume and the fullscreen button; feed real transcript words into `captionData`. Deps: R11.2 |
| **R11.10** | Remediation | Audio path: init, EQ/limiter in graph, honest LUFS | `missing` | `done` | `npm test` passed, verified in PR #83 | Call `audioEngine.init()` on first play; insert `parametricEq`/`limiter` into the bus graph; implement or honestly disable the LUFS meter; replace float seam math with rational time. Deps: none |
| **R11.11** | Remediation | Mount Scopes + Color workspace and the unwired engines | `missing` | `done` | `npm test` passed, verified in PR #84 | Add `ColorWorkspace` with `<Scopes/>` fed by real `ImageData`; wire `colorManagement`, `vramPool`, `effects/baseEffects`, `autoReframe`. Deps: R11.2 |
| **R11.12** | Remediation | Decide and dispose of dead code | `missing` | `done` | `npm test` passed, verified in PR #85 | Either wire or delete `engine/tracking/*`, `voiceIsolation`, `limiter`, `colorManagement`, `baseEffects`; remove the 30+ root `fix-*.cjs` / `*_patch*.cjs` / `*.txt` artifacts. Deps: none |
| **R11.13** | Remediation | Native project persistence + autosave | `missing` | `done` | `npm test` passed, verified in PR #86 | Implement `src/services/projectPersistence.ts` using Tauri fs/dialog; add crash-recovery autosave. Deps: none |
| **R11.14** | Remediation | Strengthen the mechanical invariant gate | `real` | `done` | Antigravity | `npm test` runs enhanced `verify-invariants.mjs` (anti-clutter, IPC contract, runtimeConfig safe defaults) + `src/__tests__/invariants.test.ts`. Deps: none |

---

## Phase exit criteria still not met

- **R1 / R2 exits** are blocked by R11.1, R11.6, R11.10 (real media in, real frames/audio out).
- **R8 exit** ("install the app, edit real footage, get a real exported video") is blocked by R11.5 and R11.13.
- **R9 exit** ("zero dummy buttons") is blocked by R11.8, R11.9, R11.11.
- **R10 exit** is blocked by R11.2, R11.4, R11.10, R11.13.

## Next agent

Start with **R11.1** and **R11.2** — both are small, both unblock whole phases, and both are pure
deletions/mismatch fixes rather than new features. See `docs/ROADMAP.md` Phase R11 for acceptance
criteria. Claim the row here before writing code (`AGENTS.md` §7.1).
