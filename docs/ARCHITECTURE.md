# CineCraft AI â€” System Architecture

> **Read first:** `docs/GAP_ANALYSIS.md` (what is real today) and `docs/ROADMAP.md` (what we are
> building). This document describes the **target** architecture, not current status.
> Decision background: ADR-002 in `docs/DECISIONS.md`.

## Overview
**CineCraft AI** is an autonomous desktop video editor: an AI agent receives user instructions,
understands editorial intent, and manipulates the timeline through validated tool calls against a
transactional, non-destructive project model â€” never by rendering flattened video.

---

## đźŹ—ď¸Ź System Components & Tech Stack

```
+-----------------------------------------------------------------------+
|                Presentation Layer â€” React 18 + TypeScript              |
|  - Canvas timeline viewport + Program Monitor (WebGPU surface)         |
|  - Prompt Console, Agent Progress Log, Asset Bin, Export Queue         |
|  - Editorial state in Zustand; UI never mutates state directly         |
+-----------------------------------+-----------------------------------+
                                    | Tauri 2.0 IPC (serde JSON)
+-----------------------------------v-----------------------------------+
|            Native Core â€” Rust (src-tauri) + WGSL shaders               |
|  - FFmpeg/libav demux + hardware decode (NVDEC / VideoToolbox)          |
|  - On-device models: Whisper ASR, Silero VAD, vision encoder           |
|  - Hardware export (NVENC / VideoToolbox / QuickSync)                  |
|  - WebGPU: YUVâ†’RGB, transforms, color/LUT, effects, compositing        |
+-----------------------------------+-----------------------------------+
                                    | typed tool calls
+-----------------------------------v-----------------------------------+
|                   Editorial Core â€” TypeScript                          |
|  - RationalTime sequence model (OpenTimelineIO-shaped)                 |
|  - Command pattern + undo/redo history                                 |
|  - Project JSON document (save / load / interchange)                   |
+-----------------------------------+-----------------------------------+
                                    | JSON-schema tools (docs/AGENT_TOOLS.md)
+-----------------------------------v-----------------------------------+
|                      AI Agent Orchestrator                             |
|  - Planner / reasoner over sequence + perception context               |
|  - Validated tool execution, wrapped in one atomic transaction          |
|  - Perception: transcript, VAD, tracking, visual embeddings             |
+-----------------------------------------------------------------------+
```

**Stack decisions already locked (ADR-002):** no C++/Qt rewrite; no Node/Python backend process.
Heavy compute lives in Rust behind Tauri commands; compositing and color run in WGSL.

---

## đź› ď¸Ź Key Architectural Layers

### 1. Presentation Layer (React 18 + TypeScript / Tailwind CSS)
* **Progress Tracking UI:** Displays the agent's thought process, current step (e.g. *Detecting silences*, *Trimming clips*, *Applying color filter*), and preview thumbnail. Tool-loop detail lives in `docs/AGENT_TOOLS.md`.
* **Interactive Timeline:** Canvas-rendered viewport synced to the editorial state. **Target**, not current: today the store is in-memory only (see `docs/GAP_ANALYSIS.md` §2.3).
* **Monitors:** Program Monitor renders through a WebGPU surface (see §4).
* **Control Modes:**
  * **Autonomous Mode:** agent receives a prompt and produces the edit through tool calls.
  * **Co-Pilot Mode:** the user edits between agent actions; every agent change is undoable as one transaction.

### 2. AI Orchestrator Layer (tool-calling agent loop)
* **Planner → Tool calls → Validate → Iterate:**
  1. User gives a high-level input (e.g. *"Cut out silent pauses, add captions, and add background lofi music"*).
  2. Agent inspects media metadata via the `probe_media` tool.
  3. Agent reads sequence state plus perception output (transcript, VAD, tracking, embeddings).
  4. Agent issues sequential, schema-validated tool calls (`detect_silence`, `cut_and_arrange_timeline`, `add_subtitles`, `add_audio_track`, …).
  5. The whole run is wrapped in one atomic transaction so a single undo reverts it (research §23).
* **Determinism:** the agent mutates the sequence model, never flattened media. Malformed tool
  arguments are rejected with a typed error and mutate nothing.

### 3. Native Media Engine (Rust, `src-tauri/`)
* Drives real `ffprobe` / `ffmpeg` plus platform hardware decoders — not a Node/Python service.
* Rust also hosts the on-device models (Whisper ASR, Silero VAD, vision encoder) so inference never
  round-trips through the browser sandbox.
* Frames cross the IPC boundary as buffers with explicit, RAII-enforced lifetime (invariant §5.6).

### 4. GPU Rendering & Compositing (WebGPU + WGSL)
* A real shader pipeline: `createShaderModule` → bind groups → pipeline. A render pass with no
  pipeline is not a renderer (`docs/GAP_ANALYSIS.md` §2.2 #6).
* Target: a DAG render graph with cache invalidation, VRAM texture pooling, and 32-bit float color.

---
## Execution Workflow

1. **Import:** User drops video files (`.mp4`, `.mov`, `.wav`) into the asset bin or uses the native
   file dialog. Ingest fingerprints the media (SHA-256) and registers it in the media pool.
2. **Analysis:** The native engine probes streams and, on request, runs transcription/VAD/tracking.
3. **Instruction:** User enters a prompt.
4. **Agent Action Loop:** the agent reads `docs/AGENT_TOOLS.md`, plans, and executes validated tool
   calls against the editorial core; the UI updates live from the resulting state.
5. **Render & Export:** the agent (or the user) triggers export; the native encoder writes a real file.
6. **Undo:** any step, including a whole agent run, is revertible from the command history.

---

## Invariants this architecture must uphold

These are load-bearing; see `AGENTS.md` section 5 for the full list and the failure each one prevents.

1. **RationalTime** for all temporal values - no float accumulation.
2. **Non-destructive** - the project stores references and edit decisions only.
3. **Command pattern** for every mutation, with a real undo stack.
4. **Audio is the master clock**; video frames never drive sequence timing.
5. **Fail loudly** - a missing implementation raises; it never returns invented data.
6. **Explicit buffer lifetime** - release GPU/decode handles immediately after submission.
7. **No shader, no renderer** - a render pass without a pipeline is a defect.

---

## Status

This document describes the target. For what actually exists today, see `docs/GAP_ANALYSIS.md`.
For the order of work, see `docs/ROADMAP.md`. For current progress, see `PROGRESS.md`.
