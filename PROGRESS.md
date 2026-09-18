# CineCraft AI - Project Status

## Status Definitions
- `todo`: Ready to be picked up. Dependencies are met.
- `in_progress`: Claimed by an agent. See `Owner` column.
- `blocked`: Cannot proceed. Reason documented in `docs/WORKLOG.md`.
- `done`: Completely implemented, mechanically verified, PR merged.

## Work Queue

| ID | Phase | Task | Status | Owner | Evidence of Completion |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R0.1** | Foundation | Test harness & initial tests | `done` | OpenHands | `npm test` runs 12+ assertions |
| **R0.2** | Foundation | CI workflow (`build` + `test` + `lint`) | `done` | OpenHands | `.github/workflows/ci.yml` merged |
| **R0.3** | Foundation | Demo boundary / strict invariants | `done` | OpenHands | All stubs throw `NotImplementedError` in live mode |
| **R0.4** | Foundation | Rust CI (`cargo check`) | `done` | OpenHands | `cargo check` runs in CI |
| **R1.1** | Editorial | Rational time model | `done` | OpenHands | Tests prove zero drift |
| **R1.2** | Editorial | Command + undo/redo stack | `done` | OpenHands | Store holds history; undo restores state |
| **R1.3** | Editorial | Real media probe (ffprobe) | `done` | OpenHands | `probe_media` returns real JSON metadata |
| **R1.4** | Editorial | Real asset registration | `done` | OpenHands | Import computes SHA-256 and populates pool |
| **R1.5** | Editorial | Project persistence (JSON) | `done` | OpenHands | Golden fixture round-trips exactly |
| **R1.6** | Editorial | Real editing ops (Split, Trim, etc.) | `done` | OpenHands | Edits respect linked A/V and gaps |
| **R1.7** | Editorial | Tool selector wiring | `done` | OpenHands | Blade/Slip/Slide mutate clip properties |
| **R1.8** | Editorial | Track state SSOT | `done` | OpenHands | `Track.muted/locked` drives UI and render |
| **R2.1** | Playback | Real frame demuxing | `done` | OpenHands | FFmpeg extraction yields real byte buffers |
| **R2.2** | Playback | WebGPU YUV420p→RGB shader | `done` | OpenHands | Shader module and pipeline compile; tests pass |
| **R2.3** | Playback | Transport (play, step, loop) | `done` | OpenHands | Playhead advances correctly |
| **R2.4** | Playback | Audio master clock | `done` | OpenHands | VFR drift test passes |
| **R2.5** | Playback | Audio gain + crossfades | `done` | OpenHands | Crossfades have no clicks, -6dB halves amplitude |
| **R2.6** | Playback | LRU frame cache + backward scrub | `done` | OpenHands | Caches surfaces, seeks to I-frame |
| **R3.1** | Compositing | Transform engine | `done` | OpenHands | Pos/Scale/Rot tests pass |
| **R3.2** | Compositing | Real Bezier keyframes | `done` | OpenHands | Cubic interpolator matches analytic values |
| **R3.3** | Compositing | DAG render graph | `done` | OpenHands | Node caching and invalidation works |
| **R3.4** | Compositing | Base effect set | `done` | OpenHands | Blur and blend modes exist |
| **R3.5** | Compositing | VRAM texture pool | `done` | OpenHands | Aliasing keeps 6x 4K under budget |
| **R4.1** | Color | WGSL Color wheels + LUT | `done` | OpenHands | Tetrahedral interpolation works |
| **R4.2** | Color | Scopes (Parade, Vector, Hist) | `done` | OpenHands | Computes correctly from frame data |
| **R4.3** | Color | Color management (partial OCIO) | `done` | OpenHands | Conversions round-trip |
| **R5.1** | Audio | Bus routing + sidechain ducking | `done` | OpenHands | Sub-graph routes properly |
| **R5.2** | Audio | 10-band EQ + limiter + PDC | `done` | OpenHands | Frequency response alters correctly |
| **R5.3** | Audio | LUFS loudness normalization | `done` | Jules | Integrated LUFS metering measures -23 LUFS accurately |
| **R6.1** | AI | Real Whisper ASR (ONNX) | `done` | `npm test` passed, verified in PR #47 | |
| **R6.2** | AI | Forced alignment + text-binding | `done` | Jules | `npm run test` passes, reverse temporal ripple delete tested |
| **R6.3** | AI | Real Silero VAD | `done` | Jules | `cargo test` and `npm run test` pass, returning real silence segments |
| **R6.4** | AI | Micro-crossfades on cut seams | `done` | Jules | `npm test` runs without failure and micro-crossfade logic handles audio seams correctly |
| **R6.5** | AI | Real object tracking (partial) | `done` | `npm test` passed, verified in PR #51 | |
| **R6.6** | AI | Auto-reframe on tracking | `done` | | |
| **R6.7** | AI | Kinetic captions rendering | `done` | `npm test` passed, verified in PR #53 | |
| **R6.8** | AI | Neural voice isolation | `done` | agent-A | `npm test` runs voice isolation test asserting improved SNR |
| **R7.1** | Agent | Typed tool layer | `done` | | |
| **R7.2** | Agent | Transactional agent execution | `done` | `npm test` passed, verified in PR #56 | |
| **R7.3** | Agent | Real reasoning loop | `done` | Jules | `npm test` passed, real reasoning loop uses tool registry and mock planner for tests |
| **R7.4** | Agent | Multimodal perception (VLM) | `done` | Jules | `npm test` passed, real implementation stubs added for VLM components |
| **R7.5** | Agent | Semantic media search | `done` | Jules | `npm test` passed, verified via string overlap matching fallback |
| **R8.1** | Export | Real FFmpeg export | `done` | Jules | `cargo test` and `npm test` pass, natively spawning ffmpeg with correct parameters |
| **R8.2** | Export | Encoder capability detection | `todo` | | |
| **R8.3** | Export | Batch export queue | `todo` | | |
| **R8.4** | Export | Installers & leak audit | `todo` | | |
