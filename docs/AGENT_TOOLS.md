# AI Agent Tools Specification (`AGENT_TOOLS.md`)

This document serves as the prompt context and API specification for the LLM Agent controlling the Video Editor.

---

## 🛠️ Tool Definitions (JSON Schema & Capabilities)

### 1. `probe_media`
Analyzes video/audio file metadata, streams, resolution, fps, duration, and codecs.
```json
{
  "name": "probe_media",
  "description": "Returns metadata, duration, frame rate, resolution, and audio channels for a given asset path.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string", "description": "Asset ID or file path" }
    },
    "required": ["asset_id"]
  }
}
```

---

### 2. `transcribe_and_align`
Transcribes video speech to text with word-level timestamps (using Whisper).
```json
{
  "name": "transcribe_and_align",
  "description": "Generates word-by-word transcript with precise start and end timestamps.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string" },
      "language": { "type": "string", "default": "auto" }
    },
    "required": ["asset_id"]
  }
}
```

---

### 3. `detect_silence`
Detects silent portions in audio/video to enable auto-jumpcutting.
```json
{
  "name": "detect_silence",
  "description": "Scans audio stream and returns array of start/end timestamps of silent segments.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string" },
      "noise_threshold_db": { "type": "number", "default": -30 },
      "min_silence_duration_sec": { "type": "number", "default": 0.5 }
    },
    "required": ["asset_id"]
  }
}
```

---

### 4. `cut_and_arrange_timeline`
Modifies the timeline by splitting, trimming, or reordering clips.
```json
{
  "name": "cut_and_arrange_timeline",
  "description": "Applies a list of clip edits (trims, cuts, re-ordering) to the main timeline track.",
  "parameters": {
    "type": "object",
    "properties": {
      "track_id": { "type": "string", "default": "main_video" },
      "edits": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "asset_id": { "type": "string" },
            "start_time": { "type": "number" },
            "end_time": { "type": "number" },
            "timeline_position": { "type": "number" }
          },
          "required": ["asset_id", "start_time", "end_time"]
        }
      }
    },
    "required": ["edits"]
  }
}
```

---

### 5. `add_subtitles`
Burn-in or overlay animated captions (Ass/SRT/Remotion components).
```json
{
  "name": "add_subtitles",
  "description": "Adds captions/subtitles with custom styling (e.g. Alex Hormozi style, karaoke effect, clean minimalism).",
  "parameters": {
    "type": "object",
    "properties": {
      "style": { "type": "string", "enum": ["bold_yellow_highlight", "clean_white", "karaoke_bounce"] },
      "font_size": { "type": "number", "default": 24 },
      "max_words_per_line": { "type": "integer", "default": 3 }
    },
    "required": ["style"]
  }
}
```

---

### 6. `add_audio_track`
Adds background music or sound effects with auto-ducking against speech.
```json
{
  "name": "add_audio_track",
  "description": "Overlays background audio or SFX with optional auto-ducking when main voice track is speaking.",
  "parameters": {
    "type": "object",
    "properties": {
      "audio_asset_id": { "type": "string" },
      "volume": { "type": "number", "default": 0.3 },
      "auto_ducking": { "type": "boolean", "default": true }
    },
    "required": ["audio_asset_id"]
  }
}
```

---

### 7. `render_video`
Renders the final video export.
```json
{
  "name": "render_video",
  "description": "Exports final project timeline to a video file.",
  "parameters": {
    "type": "object",
    "properties": {
      "resolution": { "type": "string", "enum": ["1080p", "4k", "720p", "1080x1920_shorts"] },
      "fps": { "type": "integer", "default": 30 },
      "output_format": { "type": "string", "default": "mp4" }
    },
    "required": ["resolution"]
  }
}
```
