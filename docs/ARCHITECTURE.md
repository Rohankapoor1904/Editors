# Agentic AI Video Editor - System Architecture

## Overview
The **Agentic AI Video Editor** is an autonomous desktop application where an AI Agent receives user instructions, understands video editing intent, executes timeline & media manipulation via precise tool calls, and streams real-time progress to the Desktop UI.

---

## 🏗️ System Components & Tech Stack

```
+-----------------------------------------------------------------------+
|                         Desktop UI (Electron / React)                |
|  - Real-time Timeline Preview (Remotion / HTML5 Canvas / Video.js)     |
|  - Prompt Console & Agent Progress Tracker (WebSockets / EventSource) |
|  - Asset Bin & Export Manager                                         |
+-----------------------------------+-+---------------------------------+
                                    | | IPC / REST / WebSocket
+-----------------------------------v-v---------------------------------+
|                    Backend Core (Node.js / Python FastApi)            |
|  - Media Processing Engine (FFmpeg Wrapper / Fluent-FFmpeg)           |
|  - Project State Manager (Timeline JSON / Undo-Redo Stack)            |
|  - Agent Tool Execution Handler                                       |
+-----------------------------------+-+---------------------------------+
                                    | | Function Calling / Tool Protocol
+-----------------------------------v-v---------------------------------+
|                       AI Orchestrator (LLM Agent)                    |
|  - Model: Gemini 1.5 Pro / Claude 3.5 Sonnet / OpenAI GPT-4o           |
|  - System Prompt + Tool Specs (AGENT_TOOLS.md)                        |
|  - Execution Loop: Plan -> Tool Call -> Feedback -> Next Action       |
+-----------------------------------------------------------------------+
```

---

## 🛠️ Key Architectural Layers

### 1. Desktop UI Layer (Electron + React / Tailwind CSS)
* **Progress Tracking UI:** Displays the AI Agent's thought process, current step (e.g., *Detecting silences*, *Trimming clips*, *Applying color filter*), and preview thumbnail.
* **Interactive Timeline:** Rendered via Remotion or Canvas HTML5 video player synced with project state JSON.
* **Control Modes:**
  * **Autonomous Mode:** AI receives prompt & raw files, produces final render.
  * **Co-Pilot Mode:** AI performs actions, user can manually adjust timeline.

### 2. AI Orchestrator Layer (Tool-Calling Agent Loop)
* **ReAct / Plan-and-Solve Loop:**
  1. User gives high-level input (e.g., *"Cut out silent pauses, add captions, auto-highlight funny moments, and add background lofi music"*).
  2. AI inspects media metadata via `probe_media` tool.
  3. AI generates edit decision list (EDL).
  4. AI issues sequential tool calls (e.g., `trim_clip`, `detect_silence`, `add_subtitles`, `mix_audio`).
  5. AI checks intermediate preview/status and iterates until complete.

### 3. Media Processing Engine (FFmpeg Engine)
* Uses native binaries (`ffmpeg`, `ffprobe`) or specialized APIs (Whisper AI for transcription, OpenCV for scene detection).
* Executes video/audio transformations safely and deterministically based on structured JSON tool parameters.

---

## 🔄 Execution Workflow

1. **Import:** User drops video files (`.mp4`, `.mov`, `.wav`) into the asset bin.
2. **Analysis:** AI automatically triggers `probe_media` and `transcribe_audio` to understand content.
3. **Instruction:** User enters prompt.
4. **Agent Action Loop:**
   - Agent reads `AGENT_TOOLS.md` context.
   - Executes tool calls, updating Project Timeline JSON.
   - UI updates live timeline and visual progress log.
5. **Render & Export:** Agent executes `render_video` with chosen codecs/presets.
