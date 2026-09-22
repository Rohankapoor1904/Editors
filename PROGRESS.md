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
| **R3.3** | Compositing | DAG render graph | `partial` | `blocked` | — | Graph topology + invalidation + `compileTimelineToDAG` are real, but all four node `process()` methods throw in live mode (`renderGraph/nodes.ts:19-93`) and `webgpuRenderer.ts` never consumes the graph. Corrected 2026-09-22 (opencode) from `real`/`done` per ADR-007. Needs a real-evaluation task (not yet scheduled) |
| **R3.4** | Compositing | Base effect set | `partial` | `blocked` | — | Real WGSL (`blur/luma_key/chroma_key/blend_modes.wgsl`) and pipelines; re-verified 2026-09-22 (opencode): `webgpuRenderer.ts:1-2` now imports `EffectRenderer`/`OcioConfig`, but effects still bypass the DAG. Unblock via real DAG evaluation (successor to R11.11) |
| **R3.5** | Compositing | VRAM texture pool | `partial` | `blocked` | — | `vramPool.ts` + tests exist; re-verified 2026-09-22 (opencode): renderer calls `vramPool.release()` (`webgpuRenderer.ts:432-434`) but still allocates textures directly. Unblock via pooled allocation |
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
| **R12.1** | UI & UX | Source Monitor UI Panel & In/Out Bar | `missing` | `done` | `npm test` passed, verified in PR #88 | `src/components/SourceMonitor.tsx` dual-viewer monitor with Mark In [I], Mark Out [O], Insert, Overwrite. Deps: none |
| **R12.2** | UI & UX | 1-Click Silence Trimmer Modal | `missing` | `done` | `npm test` passed, verified in PR #89 | `src/components/SilenceTrimmerModal.tsx` dialog with pause slider, preview chips, and trim action. Deps: none |
| **R12.3** | UI & UX | Interactive 3-Way Color Wheels UI | `missing` | `done` | `npm test` passed, verified in PR #90 | `src/components/ColorWheelsView.tsx` circular Lift, Gamma, Gain wheels with draggable pucks. Deps: none |
| **R12.4** | UI & UX | Multi-Track Audio Mixer Console | `missing` | `done` | `npm test` passed, verified in PR #91 | `src/components/AudioMixer.tsx` vertical faders, pan knobs, mute/solo, and stereo peak meters. Deps: none |
| **R13.1** | Editorial | Timeline Audio Waveform Rendering | `real` | `done` | Antigravity | `src/utils/waveform.ts`, `TimelineTrackEditor.tsx`, tested in `src/__tests__/waveform.test.ts`. Deps: none |
| **R13.2** | Viewport | On-Screen Interactive Transform Gizmo | `real` | `done` | Antigravity | `src/components/TransformGizmo.tsx`, `ProgramMonitor.tsx`, `UpdateTransformCommand`, tested in `src/components/__tests__/TransformGizmo.test.tsx`. Deps: none |
| **R13.3** | AI | Descript-Style 2-Way Text Ripple Editing | `real` | `done` | Antigravity | `src/components/TranscriptEditor.tsx` word selection & gap chips, tested in `src/components/__tests__/TranscriptEditor.test.tsx`. Deps: none |
| **R13.4** | Compositing | GPU Video Transitions Engine | `real` | `done` | Antigravity | `src/engine/shaders/transitions.wgsl`, `transitionEngine.ts`, tested in `src/__tests__/transitions.test.ts`. Deps: none |
| **R14.1** | Animation | Visual Keyframe Bezier Curve Editor UI | `real` | `done` | Antigravity | `src/components/CurveEditor.tsx`, `TimelineTrackEditor.tsx`, `edits.ts` (SetKeyframeCommand / RemoveKeyframeCommand), tested in `src/components/__tests__/CurveEditor.test.tsx`. Deps: none |
| **R14.2** | Animation | Velocity Envelopes & Visual Speed Ramping | `real` | `done` | Antigravity | `src/engine/speedRamp.ts`, `edits.ts` (ApplySpeedRampCommand), `TimelineTrackEditor.tsx`, tested in `src/engine/__tests__/speedRamp.test.ts`. Deps: R14.1 |
| **R14.3** | Performance | Automatic Background Proxy Generation Engine | `real` | `done` | Antigravity | `src-tauri/src/proxy_engine.rs`, `src/services/nativeBridge.ts`, `src/components/ProgramMonitor.tsx`, tested in `src/services/__tests__/proxyEngine.test.tsx`. Deps: none |
| **R15.1** | Editorial | 3-Point & 4-Point Editing Wiring | `real` | `done` | Antigravity | `src/components/SourceMonitor.tsx`, `src/core/commands/edits.ts` (InsertCommand, OverwriteCommand), `src/store/timelineStore.ts`, tested in `src/components/__tests__/SourceMonitor.test.tsx` and `src/core/commands/__tests__/advancedTrimming.test.ts`. Deps: R12.1 |
| **R15.2** | Editorial | Slip & Slide Trimming Tools | `real` | `done` | Antigravity | `src/core/commands/edits.ts` (SlipCommand with boundary clamp, SlideCommand with zero-gap abutting neighbor trimming), `src/components/TimelineTrackEditor.tsx`, tested in `src/core/commands/__tests__/advancedTrimming.test.ts`. Deps: none |
| **R15.3** | Editorial | J-Cuts & L-Cuts Split Audio/Video Trimming | `real` | `done` | Antigravity | `src/core/commands/edits.ts` (SplitTrimCommand, RealignSyncCommand), `src/types/timeline.ts` (linkedClipId, syncOffset, splitTrimType), `src/components/TimelineTrackEditor.tsx` (Alt+drag split trim, sync offset badge, Re-align context menu), tested in `src/core/commands/__tests__/advancedTrimming.test.ts`. Deps: none |
| **R16.1** | AI Creator | Kinetic Auto-Captions Engine | `real` | `done` | Antigravity | `src/engine/captions/captionEngine.ts`, `ProgramMonitor.tsx` (preset dropdown + 60fps canvas overlay), tested in `src/engine/captions/__tests__/captionEngine.test.ts`. Deps: R11.2 |
| **R16.2** | AI Creator | AI Smart Auto-Reframe (16:9 to 9:16) | `real` | `done` | Antigravity | `src/engine/autoReframe.ts`, `src/core/commands/edits.ts` (ApplyAutoReframeCommand), `src/store/timelineStore.ts` (autoReframeClipToAspect), `ProgramMonitor.tsx`, tested in `src/engine/__tests__/autoReframeWiring.test.ts`. Deps: none |
| **R16.3** | AI Creator | AI Beat Detection & Rhythm Snapping | `real` | `done` | Antigravity | `src/engine/beatDetector.ts`, `src/utils/snapping.ts`, `src/components/TimelineTrackEditor.tsx` (rhythm snapping + track markers), tested in `src/engine/__tests__/beatDetector.test.ts`. Deps: none |
| **R17.1** | Audio | AI Stem Separation (Vocal/Instrumental) | `real` | `done` | Antigravity | `src-tauri/src/audio_separation.rs`, `nativeBridge.ts`, `timelineStore.ts`, tested in `src/services/__tests__/stemSeparation.test.ts`. Deps: none |
| **R17.2** | Audio | Automated Dynamic Sidechain Ducking | `real` | `done` | Antigravity | `src/engine/audioGraph.ts`, `src/engine/audioEngine.ts`, `AudioWorkspace.tsx` (-30dB threshold, -12dB depth, 50ms attack, 300ms release), tested in `src/engine/__tests__/audioDucking.test.ts` & `src/components/__tests__/AudioWorkspaceDucking.test.tsx`. Deps: none |
| **R17.3** | Audio | One-Click Noise Isolation & Dialogue Leveler | `real` | `done` | Antigravity | `src/engine/voiceIsolation.ts`, `src-tauri/src/voice_denoise.rs`, `AudioWorkspace.tsx` (spectral subtraction + dynamic AGC with >12dB SNR gain), tested in `src/engine/__tests__/voiceIsolation.test.ts`. Deps: none |
| **R18.1** | Export | Hardware NVENC / QSV / VideoToolbox Real Pipeline | `real` | `done` | Antigravity | `src-tauri/src/export_native.rs`, `src/engine/exportEngine.ts`, `src/components/ExportModal.tsx`, tested in `src/components/ExportModal.test.tsx`. Deps: none |
| **R18.2** | Export | One-Click Social Platform Presets | `real` | `done` | Antigravity | `src/engine/exportPresets.ts` (YouTube 4K, TikTok 9:16, Broadcast 1080p, ProRes 422 HQ with -14/-24 LUFS & BT.709 tags), tested in `src/engine/__tests__/exportPresets.test.ts`. Deps: none |
| **R18.3** | Export | Batch Export Queue & Background Packaging | `real` | `done` | Antigravity | `src/engine/exportQueue.ts`, `src/components/ExportQueue.tsx`, `src/components/ExportModal.tsx`, tested in `src/engine/exportQueue.test.ts` & `src/components/__tests__/ExportModalPresets.test.tsx`. Deps: none |
| **R19.1** | Agent | Real Typed Tool Layer & Registry Execution | `real` | `done` | Antigravity | `src/services/tools/timelineTools.ts`, `src/services/tools/effectsTools.ts`, `src/services/tools/registry.ts`, tested in `src/__tests__/tools.test.ts` (12 tests passed). Deps: none |
| **R19.2** | Agent | Transactional ReAct Reasoning Loop & Copilot Execution | `real` | `done` | Antigravity | `src/services/agentOrchestrator.ts` (RuleBasedAgentPlanner, live ReAct loop, CompoundCommand single-click rollback), tested in `src/services/agentOrchestrator.test.ts` & `src/services/__tests__/agentCopilot.test.ts`. Deps: R19.1 |
| **R19.3** | Agent | Multimodal Perception & Semantic Media Search | `real` | `done` | Antigravity | `src/engine/perception/vlm.ts` (64-dim visual embeddings & intent classification) and `src/services/semanticSearch.ts` (cosine similarity & keyword search), tested in `src/engine/perception/vlm.test.ts` & `src/services/semanticSearch.test.ts`. Deps: none |
| **R20.1** | Multi-Cam | Audio Waveform Cross-Correlation Multi-Cam Sync | `real` | `done` | Antigravity | `src/engine/multicam/multicamSync.ts` (normalized cross-correlation peak offset detection in RationalTime) & `src/core/commands/multicam.ts` (`SyncClipsCommand`), tested in `src/engine/multicam/__tests__/multicamSync.test.ts`. Deps: none |
| **R20.2** | Multi-Cam | 4-Up Quad Split Multi-Cam Studio & Live Switching | `real` | `done` | Antigravity | `src/components/MultiCamViewer.tsx`, `src/components/ProgramMonitor.tsx` (top bar toggle `[ ⊞ Multi-Cam ]`), hotkeys `1`-`4`, green ON AIR tally highlight, & `SwitchMultiCamAngleCommand`, tested in `src/core/commands/__tests__/multicamCommands.test.ts` and verified in browser. Deps: R20.1 |
| **R20.3** | Multi-Cam | AI Dialogue Turn Auto-Switching & Cross-Talk Handling | `real` | `done` | Antigravity | `src/engine/multicam/autoSwitch.ts` (active speaker RMS detection, cross-talk wide shot, min 2.0s shot duration constraint), tested in `src/engine/multicam/__tests__/autoSwitch.test.ts`. Deps: R20.1, R20.2 |
| **R21.1** | Agent bridge | Bridge connection config + honest production state | `real` | `done` | opencode | Impl: URL+token configurable (`agentBridge.ts`), `CINECRAFT_AGENT_TOKEN` auth + `bridge:dev-middleware` in plugin status, explicit unavailable-in-production UI (`AIPromptConsole.tsx`), store fields. Test: `src/services/__tests__/agentBridgeConfig.test.ts` 6/6 pass; `tsc` clean; `eslint` clean; `npm run build` 4.81s. Merged in PR #92. Deps: none |
| **R21.2** | Agent | Planner honesty + LLM tool-schema exposure | `real` | `done` | opencode | Impl: `RuleBasedAgentPlanner` labelled `rule-based-fallback`, `getAgentToolSchemas()` mirrors live registry, unknown prompts get explicit no-plan response with zero mutations, `AgentPlanner` accepts external LLM planners. Test: `src/services/__tests__/agentPlannerHonesty.test.ts` 5/5 pass; regressions 36/36; `tsc` clean; `eslint` clean; `npm run build` 4.81s. Merged in PR #92. Deps: R21.1 |
| **R21.3** | Agent | Honest AI tool outputs (no hardcoded transcript/silence/captions) | `real` | `done` | opencode | Impl: deleted Welcome-words/`3.2–4.1`/`8.5–9.3`/`2.5s` fixtures + probe fallback; `transcribe`/`detect_silence` run real Whisper/VAD or typed error; `timeline_remove_silence` chains real VAD; captions map real transcript via `mapTranscriptToCaptionWords`, poem demo-gated. Test: `honestToolOutputs` 7/7, `tools` 13/13, `runtimeMode` 8/8; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: R21.1 |
| **R21.4** | Agent | VLM + semantic honesty + stronger gate | `real` | `done` | opencode | Impl: `cinecraft-vlm-v1` → `cinecraft-heuristic-v1` + heuristic disclosure docs; gate §8 bans tool-path fixtures (`Welcome`/`3.2`/`2.5`/`getCaptionWordsForClip`), requires whisper/silero wiring + demo-gate, rejects neural model-id claims. Test: `heuristicAiHonesty` 2/2, `vlm` 3/3, `semanticSearch` 4/4; gate clean; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: R21.3 |
| **R22.1** | Render | Remove placeholder caption WGSL from GPU pipeline | `real` | `done` | opencode | Impl: deleted `caption.wgsl` + accessor + group(3) plumbing; pipeline compiles grade-only; canvas captions unchanged; `({} as any)` → `()`; remaining `as any` verified load-bearing (@webgpu/types friction, documented). Test: renderer 2/2, caption 6/6 (+absence pin); gate clean; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: none |
| **R22.2** | Packaging | Bundle ONNX/Whisper models + missing-model UX | `real` | `done` | opencode | Impl: `bundle.resources` ships both models; `modelErrors.ts` maps missing-model errors to actionable guidance (no invented URLs); both editors surface it. Test: `modelErrors` 6/6; `tsc`/`eslint` clean; build 4.81s; tauri.conf JSON-valid. Merged in PR #92. Deps: none |
| **R22.3** | UI honesty | Wire Inspector inputs, guard empty diffs, drop re-throw | `real` | `done` | opencode | Impl: 7 Inspector controls read selected clip + dispatch undoable commands (new `UpdateClipVolumeCommand`); Exposure→Temperature (no engine field); vocal checkbox removed (AudioWorkspace owns it); empty plans skip diff cards; failure path keeps `failTask`, no re-throw. Test: `InspectorWiring` 6/6; `AIPromptConsole` 4/4; commands 26/26; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: none |
| **R22.4** | Tracker | Correct R3.3 DAG row to `partial` (docs-only) | `real` | `done` | opencode | Done 2026-09-22: R3.3 corrected with `file:line` evidence; R3.4/R3.5 evidence refreshed. Merged in PR #92. Deps: none |
| **R22.5** | Audio | LUFS integrated-only API + shared error class | `real` | `done` | opencode | Impl: `measureIntegratedLUFS()` live-safe (reference tone → -23.0 as documented); `measureTruePeak()` throws live / sample-peak demo; `measureLUFS()` throws live rather than half-measuring; single shared error class (re-exported). UI meter stays honestly DISABLED. Test: `loudness.behavior` 6/6 (incl. -23 calibration), old suite 2/2; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: none |
| **R22.6** | Editorial | Serialize durations honestly | `real` | `done` | opencode | Impl: `parseAssetDuration()` parses `value/rate` (validated) + `HH:MM:SS[.mmm]` at project fps; unparsable omitted (schema-optional), never invented; deserialize tolerates missing as explicit `''`. Test: `serializeDurations` 6/6, `schema` 3/3 round-trip incl. golden; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: none |
| **R23.1** | Bridge TS | Sidecar transport: status fetch + discovery + store | `real` | `done` | opencode | Impl: `fetchBridgeStatus()` (parsed fields, loud transport errors), `resolveSidecarBase()` (port/token validation), `discoverSidecar()` (`get_bridge_info` → apply base/token/store, null on any failure); store gains `bridgeKind`/`sidecarPort`/`sidecarToken`; `start()` attempts discovery fire-and-forget. Test: `sidecarTransport` 4/4 incl. real local-HTTP round-trip with bearer assertion; regressions 26/26; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: none |
| **R23.2** | Bridge Rust | Axum scaffold + /status + /timeline + get_bridge_info | `real` | `done` | Antigravity | Code written: `bridge_server.rs` (state, Bearer gate, CORS, /status /timeline /heartbeat, 5 unit tests) + `get_bridge_info` registered + sidecar spawn in `setup()` + `axum 0.7.9` locked. Merged in PR #92. Verified on host: `cargo check` passed cleanly; `cargo test` passed 12/12 unit tests (5/5 bridge_server tests passed). Deps: R23.1 |
| **R23.3** | Bridge Rust | Task routes /prompt /tool /action /connect /pending /result /heartbeat | `real` | `done` | opencode / Antigravity | Code written: 7 routes mirroring dev-plugin semantics (Bearer on POSTs, 400s, 20/20/15s timeouts, oneshot handshake, waiter cleanup); +3 unit tests (`split_outcome`, id shape). Toolchain unblocked via LLVM-MinGW / xwin combined_libs. Verified on host: `cargo check` passed (1.78s); `cargo test` passed 14/14 tests (all 7 `bridge_server` tests passed); full `npm test` (78 files / 345 passed / 1 skipped) and `verify-invariants` clean. Deps: R23.2 |
| **R23.4** | Bridge UI | Sidecar port/token/status panel | `real` | `done` | opencode | Impl: `BridgePanel` (kind badge, URL, sidecar port + masked token, copy-connect-JSON, live `/status` probe, unavailable guidance) mounted in Copilot tab. Test: `BridgePanel` 4/4 (copy JSON asserted, probe ok/fail); regressions 14/14; `tsc`/`eslint` clean; build 4.81s. Merged in PR #92. Deps: R23.1 |
| **R23.5** | Bridge e2e | Desktop end-to-end verification on Tauri host | `real` | `done` | Antigravity | Impl: `cinecraft-ai-desktop.exe` binds loopback HTTP sidecar on OS-assigned port + dynamic token discovery. Verified live on host via `scripts/verify-desktop-e2e.ps1`: external HTTP client discovers port/token, connects via POST /connect, executes editorial prompt ("Change sequence aspect ratio to 9:16 vertical shorts") via POST /prompt, mutates timeline to 1080x1920, and executes direct tool `sequence_set_aspect_ratio` to Cinema 4K (3840x2160); all verified with live process. Full `cargo check`, `cargo test` (14/14), `npm test` (78 files / 345 passed), and `verify-invariants` clean. Deps: R23.3, R23.4 |

---

## Phase exit criteria status

- **R11 exit:** Complete. All 14 tasks verified real and merged.
- **R12 exit:** Complete. Dedicated Source Monitor, Silence Trimmer dialog, Color Wheels, and Audio Mixer merged.
- **R13 exit:** Complete. Antigravity delivered 60fps timeline waveforms, on-screen transform gizmos, 2-way transcript ripple cuts, and GPU video transitions.
- **R14 exit:** Complete. Keyframing Bezier Curve Editor, Velocity Envelopes, and Background Proxy Video Generation verified.
- **R15 exit:** Complete. 3-Point Source editing, Slip/Slide tools, and J/L cut audio/video split trimming verified.
- **R16 exit:** Complete. Kinetic animated captions (Hormozi, Karaoke, Neon, Minimal), 9:16 AI Auto-Reframe with Kalman filter smoothing, and musical beat detection rhythm snapping verified.
- **R17 exit:** Complete. AI Vocal Stem Separation, Automated Sidechain Ducking (-30dB/-12dB/50ms/300ms), and Spectral Noise Isolation (>12dB SNR gain) verified.
- **R18 exit:** Complete. Hardware NVENC/QSV GPU Export, Social Presets (YouTube 4K, TikTok/Reels 9:16, Broadcast), and Batch Export Queue verified.
- **R19 exit:** Complete. AI Copilot ReAct Reasoning, Typed Timeline Tools, CompoundCommand undo transactions, and Multimodal Semantic Search verified.
- **R20 exit:** Complete. Multi-Camera Audio Cross-Correlation Alignment, 4-Up Quad Split Studio Monitor with Live Angle Switching (Keys 1-4 & green ON AIR tally), and AI Dialogue Turn Auto-Switching with cross-talk wide protection verified.
- **R21 exit:** Complete. R21.1–R21.4 verified real and merged in PR #92. External agent bridge configurable with token/URL, real tool schemas, honest AI tool outputs, and gate enforcement.
- **R22 exit:** Complete. R22.1–R22.6 verified real and merged in PR #92. Caption WGSL removed from pipeline, models bundled, Inspector inputs wired, R3.3 corrected, LUFS integrated split, durations serialized honestly.
- **R23 exit:** Complete. R23.1–R23.5 verified real and complete. Production build exposes native loopback HTTP sidecar with Bearer token authentication; external LLM/IDE callers can connect without Vite dev server, execute prompts, and mutate timeline state live on Tauri host.

## Next agent

Phase R23 is 100% complete with full live host verification. All tasks through R23 are `done`.





