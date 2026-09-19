# ROADMAP — Real Implementation Plan

> The single implementation plan for CineCraft AI. Replaces the duplicate checklist that previously
> lived in `docs/TIER1_DESKTOP_APP_ROADMAP.md` (deleted).
>
> **Status of these tasks lives in `PROGRESS.md`, not here.** This file defines *what* to build and
> *how we know it works*. Never tick a box here.

---

## How to read this plan

- Tasks are `R<phase>.<n>` and are **dependency-ordered**. Build them in order.
- Each task has an **Acceptance** clause. If it cannot be tested mechanically, the task is not ready
  to be marked done — write the test first (that is what R0.1 exists for).
- `Files` lists the ownership scope. Per `AGENTS.md` §7.2, only the claiming agent edits those files.
- Grounding: this plan is derived from the actual requirements in `docs/research/` §29–§34 (recommended
  architecture, MVP set, advanced set, AI set, 24-month phasing) and the current
  gaps in `docs/GAP_ANALYSIS.md`. It is **not** the old tick-box list.
- Guiding principle from the research's own MVP recommendation: *"focus initially on a rock-solid,
  track-based editing core … Advanced features … deferred until timeline data structures and
  audio-video master clock synchronization are verified."* We follow that.

---

## Phase R0 — Verification foundation (blocks everything)

Without this phase, every later phase is unverifiable and will regress into the same pattern
recorded in `docs/GAP_ANALYSIS.md` §3.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R0.1** | Add `vitest` + `@testing-library/react`; add `test` / `test:watch` scripts. Write first tests against code that is already real: `snapping.ts` (snap hit/miss/threshold), `colorEngine.parseCubeLUT` (valid/invalid/garbage input), `autoReframe` EMA (monotonic trajectory stays in bounds), `parametricEq` (band count + chain order). | `package.json`, `vite.config.ts`, `src/**/*.test.ts` | `npm test` runs and passes ≥12 assertions across ≥4 files. |
| **R0.2** | CI workflow: on PR, run `npm ci`, `npm run build`, `npm test`, `npm run lint`. Block merge on failure. | `.github/workflows/ci.yml` | Workflow exists, runs green on the PR that adds it, and actually fails when a deliberate type error is introduced. |
| **R0.3** | Establish the demo boundary. Mock/stub returns must be behind one explicit `runtimeMode = 'demo' \| 'live'` flag surfaced in the UI status bar. Delete silent fallbacks from main paths so live mode fails loudly (invariant §5.5). | `src/services/*`, `src/engine/*` | In `live` mode, every stubbed path throws `NotImplementedError` rather than returning invented data; tests assert the throw. |
| **R0.4** | Add `cargo check` to CI for `src-tauri/`; fix whatever it reveals (the `icons/` referenced by `tauri.conf.json` do not exist in-repo, and `tauri 2.0.0-rc` may need pinning). | `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs` | `cargo check` passes in CI. |

**Phase exit:** build, tests and both typechecks all run in CI and can fail.

---

## Phase R1 — Editorial core (the real MVP foundation)

Goal: a rock-solid, non-destructive, transactional, track-based editing core. This is the phase the
research calls MVP and it must be complete before any AI feature is wired.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R1.1** | **Rational time model.** Introduce `RationalTime { value: number; rate: number }` and frame-accurate helpers (`add`, `sub`, `compare`, `toFrames`) in `src/types/time.ts`. Migrate `Clip.startOffset/sourceIn/sourceOut/duration` and `playheadPosition` to it. | `src/types/timeline.ts`, `src/types/time.ts`, `src/store/*`, consumers | Unit tests: 1000 sequential adds/subtracts of 1/59.94s produce **zero** drift vs. exact rational arithmetic; float-based accumulation demonstrably fails the same test. |
| **R1.2** | **Command + undo/redo stack.** Every mutation becomes a command object (`apply`/`invert`, plus coalescing key for scrub/slider drags). Store holds an undo/redo history; `Cmd+Z` / `Cmd+Shift+Z` wired. Remove direct-mutation paths. | `src/core/commands/*`, `src/store/timelineStore.ts`, `src/App.tsx` | Test: apply N random commands, undo N, state deep-equals the initial snapshot; redo N restores the final state; continuous scrub coalesces into one undo entry. |
| **R1.3** | **Real media probe.** Replace hardcoded `probe_file` with an actual `ffprobe -print_format json` invocation; parse streams (codec, dimensions, fps, duration, channels, sample rate). Remove fixed 3840×2160/124.5 values. | `src-tauri/src/ffmpeg_demuxer.rs`, `src/services/nativeBridge.ts` | Given a generated 2s 320×240 30fps test file, probe returns exactly those values; on a missing path returns `Err`, not fabricated metadata. Rust unit test included. |
| **R1.4** | **Real asset registration.** Replace the fake `AssetBin` list with a real media pool: import via Tauri file dialog, SHA-256 fingerprint, duration/dimensions from R1.3, offline-relink detection. | `src/components/AssetBin.tsx`, `src/store/mediaPool.ts`, `src-tauri/src/main.rs` | Importing a file adds an entry whose fingerprint matches `sha256sum`; renaming the file on disk flags it offline; search/filter operate on real data. |
| **R1.5** | **Project persistence.** Implement the JSON project document from `docs/research/deep-research-02-*` §18 (media pool + sequences + tracks + clips + transforms/keyframes). Save/load/export-as. | `src/core/project/serialize.ts`, `src/core/project/schema.ts` | Round-trip test: state → JSON → state is deep-equal. A committed golden fixture file parses without error. |
| **R1.6** | **Real editing operations.** Implement Split, Trim (in/out), Ripple Delete, Move, Overwrite as commands, each respecting linked audio/video and gaps. Fix `rippleDelete` to handle partial overlaps and gaps correctly (current version only removes fully-contained clips — `timelineStore.ts:184-207`). | `src/core/commands/edits.ts`, `src/components/TimelineTrackEditor.tsx` | Table-driven tests: split at frame boundary, trim to zero-length rejection, ripple across a gap, overwrite preserving downstream clips. |
| **R1.7** | **Wire the tool selector.** Make Select/Blade/Slip/Slide actually transform clips (currently `activeTool` only styles a button — `TimelineTrackEditor.tsx:103`). | `src/components/TimelineTrackEditor.tsx`, `src/core/commands/edits.ts` | Interaction tests: blade at playhead yields two clips summing to the original duration; slip changes `sourceIn/Out` without moving the clip; slide moves the clip without changing source range. |
| **R1.8** | **Single source of truth for track state.** Remove the component-local `trackStates` and drive mute/solo/lock from `Track.muted/locked/solo` in the store. | `src/store/timelineStore.ts`, `src/components/TimelineTrackEditor.tsx` | Test: toggling mute in UI changes store state; muting V1 excludes it from the render list. |

**Phase exit:** a user can import real media, cut it on 4 tracks, undo everything, and save/reopen the
project — with only real data on the execution path.

---

## Phase R2 — Playback, decode and transport

Goal: real frames on screen and real audio, synchronised. This unlocks every visual AI feature later.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R2.1** | **Real frame demuxing/extraction.** Replace synthetic `extract_frames` with real decoding; expose decoded frames through the IPC boundary as byte buffers with explicit lifetime (RAII release, invariant §5.6). | `src-tauri/src/ffmpeg_demuxer.rs`, `src/services/nativeBridge.ts` | Extracting N frames from a known test clip yields N buffers whose dimensions/content match the source (checksum a mid-frame). |
| **R2.2** | **WebGPU YUV420p→RGB WGSL shader.** Write actual WGSL. Create shader module, bind group, pipeline; upload a frame texture; render it. No render pass without a pipeline (`webgpuRenderer.ts:69` is the anti-pattern to delete). | `src/engine/shaders/yuv_to_rgb.wgsl`, `src/engine/webgpuRenderer.ts` | Given a known YUV test pattern, the rendered RGBA output matches expected values within tolerance; tests assert a pipeline and shader module were created. |
| **R2.3** | **Program monitor playback.** Real transport: play/pause advances the playhead on an audio-driven clock, step ±1 frame, loop, and pull frames from R2.1/R2.2. Currently play only toggles an icon. | `src/components/ProgramMonitor.tsx`, `src/engine/transport.ts` | Playing a 5s clip advances exactly 5s of frames; frame-step lands on exact rational frame boundaries. |
| **R2.4** | **Audio master clock.** Replace the placeholder `init` with a transport where hardware audio sample counts are the master (invariant §5.4), with drift correction for VFR media. | `src/engine/audioEngine.ts`, `src/engine/transport.ts` | Test with a VFR fixture: after 60s of playback, A/V offset stays < 1 frame. |
| **R2.5** | **Per-clip audio gain + crossfades**, dB→linear done correctly and applied at real clip boundaries. | `src/engine/audioEngine.ts`, `src/core/commands/audio.ts` | Gain of −6dB measurably halves amplitude; overlapping clips crossfade without clicks (zero-crossing check). |
| **R2.6** | **LRU frame cache + backward scrubbing.** Cache decoded surfaces; on backward scrub seek to preceding I-frame and decode forward off-thread. | `src/engine/frameCache.ts`, `src-tauri/src/ffmpeg_demuxer.rs` | Bench test: backward scrub through a long-GOP clip holds ≥30fps preview; cache hit ratio reported. |

**Phase exit:** 60fps preview of real media with frame-accurate, audio-locked scrubbing.

---

## Phase R3 — Compositing, transforms and keyframes

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R3.1** | **Transform engine.** Position/Scale/Rotation/Opacity as normalized, GPU-applied transforms (currently only typed in `types/timeline.ts`, never applied). | `src/engine/transforms.ts`, `src/engine/webgpuRenderer.ts` | Rendering a 0.5-scale 90°-rotated frame matches a reference image; anchor-point math is unit-tested. |
| **R3.2** | **Real Bezier keyframes.** Replace the linear-only interpolator (`keyframing.ts:26`); honour `Keyframe.easing`; support cubic Bezier with tangents; respect rational time (R1.1). | `src/utils/keyframing.ts`, `src/types/timeline.ts` | Interpolating a 2-keyframe ease-in-out at t=0.5 returns the analytic Bezier value within 1e-6; linear mode still matches the old output. |
| **R3.3** | **DAG render graph.** Compile clips → transforms → effects → mixer → output as an evaluatable DAG with cache invalidation. Replaces the flat `Effect[]` pass-through. | `src/engine/renderGraph/*` | Test: two clips sharing an upstream effect node evaluate that node once; changing a downstream parameter invalidates only affected nodes. |
| **R3.4** | **Base effect set.** At minimum: Gaussian blur, luma key, chroma key, opacity blend modes (Porter-Duff). | `src/engine/shaders/*`, `src/engine/effects/*` | Per-effect image tests against reference output. |
| **R3.5** | **VRAM texture pool** with aliasing for non-overlapping nodes. | `src/engine/vramPool.ts` | Stress test: 6× 4K layers with high-radius blur does not exceed a fixed VRAM budget and does not crash. |

**Phase exit:** multi-layer compositing with animated, GPU-applied transforms and stackable effects.

---

## Phase R4 — Color pipeline

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R4.1** | **Color wheels + LUT shader.** Actually evaluate the parsed `.cube` data (real since day one, unused so far) in WGSL: tetrahedral interpolation, 3-way Lift/Gamma/Gain, ASC-CDL math, 32-bit float. Remove `any` types from the renderer. | `src/engine/shaders/color.wgsl`, `src/engine/colorEngine.ts`, `src/engine/webgpuRenderer.ts` | Identity LUT leaves pixels unchanged; a known LUT produces reference-matching output; `lutIntensity` (declared, never read today) blends correctly. |
| **R4.2** | **Scopes.** RGB parade, vectorscope, histogram computed from real frame data. | `src/engine/scopes.ts`, `src/components/Scopes.tsx` | Against a known test pattern (e.g. SMPTE bars), scope output matches expected distributions. |
| **R4.3** | **Color management.** OpenColorIO-style config + working space + display transform (the research targets OCIO/ACEScg; a documented, tested subset is acceptable, but it must be real and labelled `partial`). | `src/engine/colorManagement.ts` | Test: converting between two defined spaces and back returns the original within tolerance. |

**Phase exit:** a grade applied on one clip is visually correct and reproducible from project JSON.

---

## Phase R5 — Audio finishing

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R5.1** | **Bus routing + sidechain ducking** on a real bus graph (current ducking is a single hardcoded gain node). | `src/engine/audioGraph.ts` | Test: music bus ducks by the configured amount only while dialogue is present, attack/release measured. |
| **R5.2** | **10-band EQ + brickwall limiter + PDC.** EQ exists as node construction only; add real parameter control, latency compensation, and a limiter. | `src/engine/parametricEq.ts`, `src/engine/limiter.ts` | Frequency-response test: a +6dB band boost at 1kHz measurably lifts 1kHz vs. 100Hz in the rendered output. |
| **R5.3** | **LUFS loudness normalization** (ITU-R BS.1770-4) + integrated/true-peak metering. | `src/engine/loudness.ts` | Measuring a reference −23 LUFS tone returns −23 ± 0.1 LUFS. |

**Phase exit:** dialogue + music can be mastered to a broadcast target and the measurement is trusted.

---

## Phase R6 — AI intelligence layer

Prerequisite: R1–R2 complete. Every task here replaces a specific stub from `docs/GAP_ANALYSIS.md` §2.2.
All AI runs **on-device** — no cloud dependency on the main path.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R6.1** | **Real Whisper ASR.** Load a real whisper.cpp/ONNX model, feed real PCM, emit real word timestamps. Replaces the hardcoded 15-word transcript (`whisperTranscriber.ts:49`, `whisper_onnx.rs:26`). | `src-tauri/src/whisper_onnx.rs`, `src/services/whisperTranscriber.ts` | Transcribing a committed speech fixture returns the known words with timestamps within ±150ms of ground truth. |
| **R6.2** | **Real forced alignment + text-to-timeline binding.** Word timestamps aligned to audio; editing text ripples the correct range (the binding exists in `TranscriptEditor.tsx` but operates on fabricated data). | `src/services/alignment.ts`, `src/components/TranscriptEditor.tsx` | Deleting a word removes exactly that word's audio range, verified by duration arithmetic on a fixture. |
| **R6.3** | **Real Silero VAD.** Replace the two hardcoded segments (`sileroVad.ts:46`, `silero_vad.rs:24`). | `src-tauri/src/silero_vad.rs`, `src/services/sileroVad.ts` | On a fixture with silences at known offsets, detection returns those offsets within tolerance; silence-free fixture returns none. |
| **R6.4** | **Filler-word + zero-crossing micro-crossfades** on cut seams. | `src/core/commands/silence.ts`, `src/engine/audioEngine.ts` | Automated cut set produces no audible click (seam discontinuity below threshold). |
| **R6.5** | **Real object tracking.** Replace invented `Math.sin` trajectory and 1×1 mask (`sam2Masking.ts:34`, `:58`). Start with a real, testable tracker (e.g. ONNX segmentation + optical-flow association) and label scope `partial` honestly. | `src/engine/tracking/*`, `src-tauri/src/*` | Tracking a subject in a fixture clip keeps the reported bbox IoU above threshold across all frames. |
| **R6.6** | **Auto-reframe on real tracking.** Feed R6.5 output into the (already real) `autoReframe` smoothed crop; add Kalman smoothing. | `src/engine/autoReframe.ts` | 16:9→9:16 output keeps the subject inside the crop window for every frame of the fixture. |
| **R6.7** | **Kinetic captions.** Real text layout + GPU rendering of word-highlight captions (currently subtitles are never rendered). | `src/engine/captions/*`, `src/engine/shaders/*` | Rendering a fixture transcript produces frames with the expected active-word highlight at each timestamp. |
| **R6.8** | **Neural voice isolation / denoise** (research §32). | `src/engine/voiceIsolation.ts` | Measured SNR improvement on a noisy speech fixture exceeds a defined threshold. |

**Phase exit:** every AI feature in the MVP+advanced set operates on real media with tests.

---

## Phase R7 — Agentic layer

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R7.1** | **Typed tool layer.** Implement every tool in `docs/AGENT_TOOLS.md` as a real, schema-validated executor over the R1 command stack. Reject malformed arguments with structured errors. | `src/services/tools/*`, `docs/AGENT_TOOLS.md` | Each tool has tests: valid call mutates state correctly, invalid call returns a typed error and mutates nothing. |
| **R7.2** | **Transactional agent execution.** Wrap multi-tool agent runs in one atomic compound command so a single `Cmd+Z` reverts a whole agent operation (research §23). | `src/core/commands/transaction.ts`, `src/services/agentOrchestrator.ts` | Test: an agent run issuing 5 tool calls is reverted by exactly one undo. |
| **R7.3** | **Real reasoning loop.** Replace the two `lower.includes` branches (`agentOrchestrator.ts:22`, `:38`) with a planner that reads sequence state, plans, calls R7.1 tools, and validates results — with a deterministic mocked-LLM test path. | `src/services/agentOrchestrator.ts` | Given a scripted plan, the orchestrator executes the expected tool sequence and state deltas; failure mid-plan rolls back via R7.2. |
| **R7.4** | **Multimodal perception (the VLM work).** Implement the visual stream the research describes: sample frames, run an on-device vision encoder (CLIP/SigLIP-class) to embeddings, fuse with transcript + telemetry. This is entirely `missing` today (`docs/GAP_ANALYSIS.md` §2.3). | `src/engine/perception/*`, `src-tauri/src/*`, local vector store | Embeddings of a fixture frame set are reproducible and semantically ordered (near-duplicate frames cluster); intent classification on a labelled fixture beats a defined baseline. |
| **R7.5** | **Semantic media search** over R7.4 embeddings (SQLite FTS5 + vector index per research stack). | `src/services/semanticSearch.ts` | Natural-language query returns the expected clips from a labelled fixture set. |

**Phase exit:** an agent can take a natural-language instruction and restructure the timeline through
validated, undoable tool calls, optionally using visual understanding.

---

## Phase R8 — Export, packaging, polish

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R8.1** | **Real export.** Actually spawn FFmpeg with the built argument array; stream real progress from its output; verify the file exists and is playable. Delete the `setTimeout` progress loop (`exportEngine.ts:79`). | `src-tauri/src/export_native.rs`, `src/engine/exportEngine.ts` | Exporting a fixture timeline writes a real file; `ffprobe` on the output reports the requested codec/dimensions/duration. |
| **R8.2** | **Encoder capability detection.** Probe available hardware encoders at runtime instead of hardcoding "Apple VideoToolbox / NVENC" in the UI (`ExportModal.tsx`). | `src-tauri/src/export_native.rs`, `src/components/ExportModal.tsx` | Run on a machine without NVENC: UI does not offer NVENC and falls back correctly. |
| **R8.3** | **Batch export queue + social presets** with real per-job status. | `src/components/ExportQueue.tsx`, `src/engine/exportQueue.ts` | Queueing 3 jobs produces 3 real files in order. |
| **R8.4** | **Cross-platform installers + memory-leak audit.** Ship real icons (referenced but absent), fix the Tauri config, and run a soak test. | `src-tauri/icons/*`, `src-tauri/tauri.conf.json` | Installers build for target platforms; 30-minute soak shows no monotonic memory growth. |

**Phase exit:** a user can install the app, edit real footage, and get a real exported video.

---

## Phase R9 — UI Interactivity, Editorial UX & Workspace Panels

Goal: Bridge the gap between the tested backend engines and the frontend user interface. Wire all
top navigation menus, provide web browser file ingestion, render dedicated Color & FX and Audio
workspaces, enable timeline track management and clip drag-to-move, wire NLE keyboard shortcuts, and
commit real AI action diffs.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R9.1** | **Top navigation menu bar & dropdowns.** Wire File, Edit, View, Clip, Sequence, Effects, and Help with real dropdown menus. Connect File (New/Save/Import/Export), Edit (Undo/Redo/Split), View (Zoom In/Out/Reset/Snapping), and Sequence (Add Track) to `timelineStore`. Include click-outside to close. | `src/components/TopBar.tsx`, `src/components/TopBar.test.tsx` | Clicking menu items opens interactive dropdowns; clicking options dispatches store actions; unit tests verify dropdown rendering and action dispatch. |
| **R9.2** | **Web file picker fallback & media-to-timeline insertion.** In `AssetBin.tsx`, add an HTML5 file input fallback (`<input type="file" />`) for browser environments; generate valid media assets with ObjectURLs/duration; add "Add to Timeline" button on asset cards; enable drag-and-drop of assets onto timeline tracks. | `src/components/AssetBin.tsx`, `src/components/TimelineTrackEditor.tsx`, `src/services/nativeBridge.ts` | In web mode, selecting files adds media assets to the pool; clicking Add to Timeline creates a new clip on the targeted track with matching duration; unit tests verify media ingestion and timeline clip creation. |
| **R9.3** | **Color & FX workspace (Color Wheels UI & Scopes).** Mount `Scopes.tsx` (RGB Parade, Vectorscope, Histogram) alongside interactive Lift/Gamma/Gain 3-way color wheels and Saturation/Contrast controls when `activeWorkspace === 'color'`. Wire adjustments to `colorEngine.ts` and `webgpuRenderer.ts`. | `src/components/ColorWorkspace.tsx`, `src/components/Scopes.tsx`, `src/App.tsx`, `src/engine/colorEngine.ts` | Switching to 'color' workspace renders ColorWorkspace with scopes and grading controls; changing color wheel values updates active clip grading uniforms; tests verify component mounting and uniform propagation. |
| **R9.4** | **Audio workspace (10-Band EQ & Master VU meter).** Mount visual 10-band EQ curve interactive editor, track volume faders, and live stereo VU/LUFS meter when `activeWorkspace === 'audio'`. Wire sliders to `parametricEq.ts`, `limiter.ts`, and `loudness.ts`. | `src/components/AudioWorkspace.tsx`, `src/components/ParametricEqView.tsx`, `src/App.tsx`, `src/engine/parametricEq.ts` | Switching to 'audio' workspace renders audio mixer view; adjusting EQ sliders updates `ParametricEqEngine` frequency gains; tests verify slider interaction and graph parameter synchronization. |
| **R9.5** | **Timeline track management & clip drag-to-move.** Add "+ Add Track" dropdown (Video/Audio) in timeline header; implement horizontal drag-to-move for clips on the canvas dispatching `MoveCommand`; add clip context menu (Delete, Split, Mute). | `src/components/TimelineTrackEditor.tsx`, `src/store/timelineStore.ts`, `src/core/commands/edits.ts` | Clicking Add Track adds a new track in the store; dragging a clip updates its `startOffset` and `trackId` via `MoveCommand`; tests verify track addition and clip repositioning. |
| **R9.6** | **Global NLE keyboard shortcuts manager.** Implement centralized keyboard shortcut listener: Space (Play/Pause), J/K/L (Shuttle), C/B (Blade tool), V (Select tool), S (Snapping toggle), Delete/Backspace (Ripple delete selected clip), Left/Right (Step 1 frame), Home/End (Jump to start/end). Inactive while typing in input fields. | `src/utils/keyboardShortcuts.ts`, `src/App.tsx` | Keyboard event handler dispatches corresponding store commands for all specified hotkeys; typing in text inputs does not trigger shortcuts; unit tests verify key event mapping to store actions. |
| **R9.7** | **AI prompt console real diff execution & transaction commit.** Wire AI Prompt Console diff cards ("Accept", "Reject", "Accept All", "Rollback") to real `executeCommand` transactions so accepting a diff modifies the timeline EDL and rolling back reverts the transactional compound command. | `src/components/AIPromptConsole.tsx`, `src/services/agentOrchestrator.ts`, `src/core/commands/transaction.ts` | Accepting a silence-cut diff executes real ripple deletes on the timeline; rolling back reverts the timeline state to pre-AI snapshot; tests assert timeline mutations on diff acceptance. |

**Phase exit:** all navigation menus, workspace views, media ingestion, track operations, and keyboard controls are fully interactive with zero dummy buttons.

---

## Phase R10 — Playback Pipeline, Video/Audio Decoder & Fallback Renderer

Goal: Enable real video frame rendering onto the Program Monitor canvas, add a 2D Canvas fallback
when WebGPU is absent, connect WebAudio buffer playback for timeline clips, add a Clip Property
Inspector, and implement full project document save/load (.cinecraft JSON) in the UI.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R10.1** | **Video frame feed into ProgramMonitor (WebCodecs & WebGPU pipeline).** Wire `ProgramMonitor.tsx` to read the active video clip under `playheadPosition`, extract/decode frame byte buffers via WebCodecs `VideoDecoder` (browser) or `nativeBridge.demuxVideoFrames` (desktop Tauri), and feed frame textures into `webgpuEngine.renderFrame()`. | `src/components/ProgramMonitor.tsx`, `src/engine/frameCache.ts`, `src/engine/webgpuRenderer.ts` | Scrubbing or playing timeline across video clips passes real frame buffers to the renderer; canvas displays real video images instead of black clear color. |
| **R10.2** | **2D Canvas fallback renderer for non-WebGPU environments.** Implement a 2D Canvas rendering fallback in `webgpuRenderer.ts` / `ProgramMonitor.tsx` when `navigator.gpu` is unavailable, rendering frames, transforms, and captions via `CanvasRenderingContext2D`. | `src/engine/webgpuRenderer.ts`, `src/components/ProgramMonitor.tsx` | In environments without WebGPU support, monitor displays decoded video frames and captions via 2D canvas without crashing. |
| **R10.3** | **Timeline clip WebAudio playback engine.** Connect audio tracks/clips to real WebAudio `AudioBufferSourceNode` instances scheduled by transport timing; decode audio assets into `AudioBuffer` on import; route through track gain nodes and buses (`dialogue`, `music`, `sfx`). | `src/engine/audioEngine.ts`, `src/engine/transport.ts` | Playing timeline produces audible sound from imported audio/video clips synchronized with the transport clock; muting a track silences its audio output. |
| **R10.4** | **Clip Inspector & Property Controls panel.** Create a right-hand Clip Inspector panel showing selected clip properties: Position X/Y, Scale, Rotation, Opacity, Volume (dB), Fade In/Out duration, and Speed. Wire inputs to store commands. | `src/components/ClipInspector.tsx`, `src/components/AIPromptConsole.tsx`, `src/store/timelineStore.ts` | Selecting a clip displays its current transform/audio properties; editing values updates the clip in the store via command stack and reflects in monitor preview. |
| **R10.5** | **Project Document Save/Open dialogs & persistence (.cinecraft JSON).** Wire File -> Save Project to download the `.cinecraft` JSON file generated by `serializeProject()`; wire File -> Open Project and drag-and-drop `.cinecraft` file onto window to load into `timelineStore` via `deserializeProject()`. | `src/services/projectPersistence.ts`, `src/components/TopBar.tsx`, `src/App.tsx` | Saving exports valid `.cinecraft` JSON; opening a saved file restores all tracks, clips, and timeline state deep-equal to saved state; unit test verifies browser download/upload roundtrip. |

**Phase exit:** timeline clips display decoded video on screen, play real synchronized audio through speakers, and projects can be saved and restored from disk.

---

## Phase R11 — Remediation: remove the demo paths that survived R0–R10

Goal: close every finding from the 2026-09-19 re-audit (`docs/GAP_ANALYSIS.md` §6) so that the
`real`/`partial` marks in `PROGRESS.md` are honest. Nothing in this phase adds a new feature — it
deletes fabricated data, repairs broken contracts, and wires engines that were built but never
called. **Start here before any further R6/R7/R8 feature work.**

Grounding: every task below cites a `file:line` from the audit. The phase exists because R0–R10 were
marked `done` while `stub`/`missing` code was still on the main path — the same failure
`docs/GAP_ANALYSIS.md` §3 documents, repeating under a new phase name.

| ID | Task | Files | Acceptance |
| :--- | :--- | :--- | :--- |
| **R11.1** | **Fix the Whisper/VAD IPC contract.** The frontend invokes `transcribe_audio` (`whisperTranscriber.ts:26`) but Rust registers `run_whisper_stt` (`main.rs:52`); the call can never resolve. Rename to match, and delete the hardcoded 15-word transcript (`whisperTranscriber.ts:47-66`) and the hardcoded silence windows (`sileroVad.ts:51-54`). | `src/services/whisperTranscriber.ts`, `src/services/sileroVad.ts`, `src-tauri/src/main.rs` | A contract test enumerates every `invoke('<name>')` string in `src/` and asserts each resolves to a name in `generate_handler!`. In live mode both services throw `NotImplementedError`; a hardcoded transcript in either path fails the suite. |
| **R11.2** | **Unblock the WebGPU pipeline.** `webgpuRenderer.ts:70` calls `captionEngine.getWGSLShaderCode()`, which throws in live mode (`captionEngine.ts:17`), so `init()` throws and is swallowed (`:140-147`) → silent Canvas2D downgrade on every launch. Remove the live/demo guard from shader-source access (shader *source* is not an execution path), and stop swallowing the init failure. | `src/engine/captions/captionEngine.ts`, `src/engine/webgpuRenderer.ts`, `src/components/ProgramMonitor.tsx` | Test: with a mocked `navigator.gpu`, `init()` returns `true`, `createShaderModule` is called, and the combined WGSL compiles; when init genuinely fails the monitor shows an error state rather than a `Canvas2D` pill. |
| **R11.3** | **Make demo mode dev-only.** `TopBar.tsx:39-41` ships a user-facing LIVE↔DEMO toggle; one click replaces production behaviour with fabricated data (invariant §5.5 / `AGENTS.md` §10.4). Gate `setRuntimeMode` behind a dev build flag and remove the toggle from release UI. | `src/services/runtimeConfig.ts`, `src/components/TopBar.tsx` | Release build cannot enter `demo` (test asserts `setRuntimeMode('demo')` is a no-op / throws when `import.meta.env.DEV` is false); row R0.3 may then return to `done`. |
| **R11.4** | **Remove the hardcoded demo project.** `timelineStore.ts:47-163` boots a fabricated project (`proj_demo_01`, `Interview_Take1.mp4`, `Upbeat_Lofi_Beat.mp3`) on every launch. | `src/store/timelineStore.ts` | The initial store state is empty; a test asserts no clip/asset with a demo name exists at boot. |
| **R11.5** | **Real export or honest failure.** `exportEngine.ts:98-104` fakes progress with `setTimeout(120)` and returns `true` without writing a byte; the real Rust command is only `console.log`ged (`:87`). Spawn ffmpeg, stream real progress from its output, verify the file exists and is `ffprobe`-able, and delete the fabricated encoder list from the JS fallback (`nativeBridge.ts:217`). | `src/engine/exportEngine.ts`, `src/engine/exportQueue.ts`, `src/services/nativeBridge.ts`, `src-tauri/src/export_native.rs` | Exporting a fixture writes a real file; `ffprobe` reports the requested codec/dimensions/duration; a deliberately failing encode marks the job `failed` with the stderr captured. |
| **R11.6** | **Fix desktop asset import & offline detection.** `AssetBin.tsx:42` calls `importMediaFile('')` expecting a file picker, but `main.rs:41` rejects an empty path; the JS fallback returns `mock_sha256_*` and `checkFileExists → true` (`nativeBridge.ts:181,201`). | `src/components/AssetBin.tsx`, `src/services/nativeBridge.ts`, `src-tauri/src/main.rs` | Separate "pick file" (`dialog`) from "probe file" (`ffprobe`); import computes a real SHA-256; a renamed file on disk is flagged offline. Verified in a Tauri host or explicitly marked `unverified: requires desktop Tauri host`. |
| **R11.7** | **TranscriptEditor: real asset, no unhandled rejection.** `TranscriptEditor.tsx:14` transcribes a non-existent `/demo/audio.wav` on mount and the promise has no `.catch`. | `src/components/TranscriptEditor.tsx` | The editor transcribes the selected asset, shows a loading state, and surfaces failure; no `/demo/` path remains in `src/`. |
| **R11.8** | **Make the AI console honest (or absent).** The Copilot throws silently (`agentOrchestrator.ts:32` → re-thrown at `AIPromptConsole.tsx:107`), the whole Inspector tab is unbound `defaultValue` inputs (`:389-552`), and `Clip`/`Effects`/`Help` menus are empty arrays (`TopBar.tsx:119-128`). | `src/components/AIPromptConsole.tsx`, `src/components/TopBar.tsx`, `src/services/agentOrchestrator.ts` | Until R7 lands, the Copilot shows an explicit "agent unavailable" state and logs nothing misleading; Inspector inputs are either wired to commands or removed; no menu renders empty. |
| **R11.9** | **ProgramMonitor controls & caption feed.** `previewQuality`, `aspectRatio`, the static volume bar and the no-`onClick` fullscreen button are decorative (`ProgramMonitor.tsx:17,140-183,272-282`); `transcriptWords` is never populated (`:21`) so captions can never render. | `src/components/ProgramMonitor.tsx` | Each control changes renderer behaviour (`previewQuality` → decode resolution, aspect → canvas transform); real transcript words reach `captionData`. |
| **R11.10** | **Audio path: init, EQ/limiter in graph, honest LUFS.** `audioEngine.init()` is called nowhere, so the master clock falls back to `performance.now()` (`R2.4`); `parametricEq`/`limiter` are built but never inserted into the graph (`R5.2`); the LUFS meter is permanently `null` (`AudioWorkspace.tsx:10`); seam math uses float seconds (`audioEngine.ts:149-152`, invariant §5.1). | `src/engine/audioEngine.ts`, `src/engine/parametricEq.ts`, `src/engine/limiter.ts`, `src/components/AudioWorkspace.tsx` | Playing the timeline produces audible, correctly-gained output from the audio clock; an EQ boost is measurable in the output; the meter shows real LUFS or an explicit disabled state; a zero-drift test covers the rational seam arithmetic. |
| **R11.11** | **Mount the Color workspace and the unwired engines.** Add `src/components/ColorWorkspace.tsx` (missing entirely) with `<Scopes/>` fed by real `ImageData`; wire `colorManagement`, `vramPool`, `effects/baseEffects` and `autoReframe`, all of which currently have zero call sites. | `src/components/ColorWorkspace.tsx`, `src/components/Scopes.tsx`, `src/App.tsx`, `src/engine/*` | Switching to the `color` workspace renders scopes from the live frame; grading changes reach the render uniforms; a test asserts each previously-orphaned module has at least one inbound import on the main path. |
| **R11.12** | **Decide and dispose of dead code.** Either wire or delete `engine/tracking/*`, `voiceIsolation.ts`, `limiter.ts`, `colorManagement.ts`, `effects/baseEffects.ts`; remove the 30+ root `fix-*.cjs` / `update-*.cjs` / `web_import_patch*.cjs` / `*_output.txt` one-shot artifacts. | repo root, `src/engine/*` | No exported module on `src/` has zero inbound references (checked mechanically); no one-shot agent patch scripts remain in version control. |
| **R11.13** | **Native project persistence + autosave.** Implement the missing `src/services/projectPersistence.ts` on Tauri `fs`/`dialog`; add crash-recovery autosave so a reload does not discard the project (`TopBar.tsx:45-97` currently uses Blob/FileReader only). | `src/services/projectPersistence.ts`, `src/components/TopBar.tsx`, `src/App.tsx` | Save/open round-trips through the native filesystem; a test injects an edit, simulates a reload, and asserts the edit survives via autosave. |
| **R11.14** | **Strengthen the mechanical invariant gate.** `scripts/verify-invariants.mjs` passes today despite a self-declared placeholder shader, a hardcoded demo project, and a broken IPC contract, because it only string-matches. Replace string checks with behavioural/AST checks covering the §6.4 catalogue. | `scripts/verify-invariants.mjs`, `.github/workflows/verify.yml` | Deliberately reintroducing any of: a hardcoded demo fixture, a placeholder shader, an orphaned engine, or an `invoke`/command mismatch makes `npm test` fail with a specific message. |

**Phase exit:** `PROGRESS.md` contains no row whose `Impl` overstates the code; every `real` row has a
behavioural test; no fabricated data is reachable in a release build; and the invariant gate fails
when any of the above regressions is reintroduced.

---

## Deferred / experimental (not scheduled)

From research §33 — do **not** start these before R8:

- Generative video expansion (outpainting, diffusion handle-frame synthesis).
- Zero-shot multi-camera switching.
- CRDT-based real-time collaborative editing.
- OBS tutorial automation pipeline end-to-end (cursor-guided zoom, OCR command lower-thirds,
  automated chapter generation). Individual primitives from R6/R7 are prerequisites.

---

## Cross-cutting risks to manage every phase

From research §35, tracked here so they are not rediscovered late:

| Risk | Mitigation | Owning task |
| :--- | :--- | :--- |
| Backward scrub stalls on long-GOP 4K | Async LRU cache, seek to I-frame, decode forward | R2.6 |
| A/V drift on VFR media | Audio DMA as master clock, polyphase resample | R2.4 |
| VRAM exhaustion with stacked layers | Texture pool + aliasing | R3.5 |
| WebCodecs/GPU handle leaks | RAII release after submit | R2.1, R3.1 |
| Float timing accumulation | Rational integer arithmetic | R1.1 |
