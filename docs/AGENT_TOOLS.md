# AI Agent Tools Specification (`AGENT_TOOLS.md`)

> **Status: contract, not implementation.** None of the tools below are implemented as executors
> today — `src/services/agentOrchestrator.ts` matches on substrings (`:22`, `:38`) instead of calling
> any of them. Building the real, schema-validated executor layer is task **R7.1** in `docs/ROADMAP.md`.
>
> This file is the **authoritative tool contract**: implementations must conform to these schemas,
> and the agent's prompt context is generated from them. If you change a schema, record it in
> `docs/DECISIONS.md` — it is an interface other code depends on.
>
> Per `AGENTS.md` invariant §5.5: a tool that is not implemented must return a typed error, never a
> hardcoded success payload.

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

---

### 8. `sequence_set_aspect_ratio`
Changes the sequence canvas to a new aspect ratio for social targets (research §23).
```json
{
  "name": "sequence_set_aspect_ratio",
  "description": "Sets the sequence canvas dimensions, e.g. 1080x1920 for vertical shorts.",
  "parameters": {
    "type": "object",
    "properties": {
      "width": { "type": "integer" },
      "height": { "type": "integer" }
    },
    "required": ["width", "height"]
  }
}
```

---

### 9. `video_apply_auto_reframe`
Re-frames the picture to keep the tracked subject inside the crop window (research §23, §24).
```json
{
  "name": "video_apply_auto_reframe",
  "description": "Generates a smoothed, keyframed crop window that keeps the subject centred after an aspect-ratio change.",
  "parameters": {
    "type": "object",
    "properties": {
      "track_id": { "type": "string" },
      "tracking_mode": { "type": "string", "enum": ["ActiveSpeaker", "Saliency", "Manual"], "default": "ActiveSpeaker" },
      "smoothing": { "type": "number", "description": "Kalman/EMA smoothing factor, 0.0-1.0", "default": 0.15 }
    },
    "required": ["track_id"]
  }
}
```

---

### 10. `transcript_filter_tokens`
Retains only the selected transcript ranges, rippling the timeline accordingly (research §23).
```json
{
  "name": "transcript_filter_tokens",
  "description": "Keeps only the given transcript token ranges and removes the rest from the timeline.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string" },
      "retained_token_ranges": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "start_token_index": { "type": "integer" },
            "end_token_index": { "type": "integer" }
          },
          "required": ["start_token_index", "end_token_index"]
        }
      }
    },
    "required": ["asset_id", "retained_token_ranges"]
  }
}
```

---

### 11. `captions_generate_karaoke`
Generates word-level highlighted ("kinetic") captions (research §23, §32).
```json
{
  "name": "captions_generate_karaoke",
  "description": "Generates animated captions with per-word highlight timing.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string" },
      "style_preset": {
        "type": "string",
        "enum": ["DynamicWordHighlight", "bold_yellow_highlight", "clean_white", "karaoke_bounce"]
      },
      "max_words_per_line": { "type": "integer", "default": 3 }
    },
    "required": ["asset_id", "style_preset"]
  }
}
```

---

### 12. `timeline_remove_silence`
Removes silent ranges across tracks with click-free seams (research §23, §24).
```json
{
  "name": "timeline_remove_silence",
  "description": "Ripple-deletes silent intervals from the timeline, inserting micro-crossfades at audio seams.",
  "parameters": {
    "type": "object",
    "properties": {
      "threshold_seconds": { "type": "number", "default": 0.5 },
      "track_ids": { "type": "array", "items": { "type": "string" } }
    },
    "required": ["threshold_seconds"]
  }
}
```

---

### 13. `add_overlay_object`
Places a graphic overlay, sticker, badge, or image onto an overlay track at a specific timestamp with optional physics animation and SFX.
```json
{
  "name": "add_overlay_object",
  "description": "Places a graphic overlay, sticker, badge, or image onto an overlay track at a specific timestamp with optional physics animation and SFX.",
  "parameters": {
    "type": "object",
    "properties": {
      "asset_id": { "type": "string", "description": "Asset ID or file path of the overlay graphic" },
      "start_seconds": { "type": "number", "default": 0 },
      "duration_seconds": { "type": "number", "default": 3.0 },
      "position_x": { "type": "number", "default": 0 },
      "position_y": { "type": "number", "default": 0 },
      "scale": { "type": "number", "default": 1.0 },
      "animation_preset": {
        "type": "string",
        "enum": ["none", "spring_pop", "slide_up", "pendulum_swing", "fade_in"],
        "default": "none"
      },
      "sfx": {
        "type": "string",
        "enum": ["none", "pop", "whoosh", "chime", "marker"],
        "default": "none"
      }
    },
    "required": ["asset_id"]
  }
}
```

---

### 14. `apply_clip_animation`
Applies physics-based keyframe animations (spring pop, bounce, pendulum swing, slide) to any clip on the timeline.
```json
{
  "name": "apply_clip_animation",
  "description": "Applies physics-based keyframe animations (spring pop, bounce, pendulum swing, slide) to any clip on the timeline.",
  "parameters": {
    "type": "object",
    "properties": {
      "clip_id": { "type": "string", "description": "Target clip ID" },
      "animation_type": {
        "type": "string",
        "enum": ["spring_pop", "pendulum_swing", "slide_up", "fade_in", "bounce"],
        "default": "spring_pop"
      },
      "duration_seconds": { "type": "number", "default": 0.5 }
    },
    "required": ["clip_id"]
  }
}
```

---

### 15. `add_sfx_hit`
Adds a synchronized Foley sound effect (pop, whoosh, marker, phone_bell, chime) at an exact timeline position.
```json
{
  "name": "add_sfx_hit",
  "description": "Adds a synchronized Foley sound effect (pop, whoosh, marker, phone_bell, chime) at an exact timeline position.",
  "parameters": {
    "type": "object",
    "properties": {
      "sfx_type": {
        "type": "string",
        "enum": ["pop", "whoosh", "marker", "phone_bell", "chime"]
      },
      "timestamp_seconds": { "type": "number", "default": 0 },
      "volume": { "type": "number", "default": 0.8 }
    },
    "required": ["sfx_type"]
  }
}
```

---

### 16. `add_motion_title`
Creates an animated title card, lower-third, cursive name, or callout box with custom styling and entrance timing.
```json
{
  "name": "add_motion_title",
  "description": "Creates an animated title card, lower-third, cursive name, or callout box with custom styling and entrance timing.",
  "parameters": {
    "type": "object",
    "properties": {
      "text": { "type": "string" },
      "start_seconds": { "type": "number", "default": 0 },
      "duration_seconds": { "type": "number", "default": 3.0 },
      "style": {
        "type": "string",
        "enum": ["bold_header", "cursive_accent", "highlight_card", "badge"],
        "default": "bold_header"
      },
      "color": { "type": "string", "default": "#0B3558" },
      "background": { "type": "string", "default": "#FDF3AE" },
      "animation_preset": {
        "type": "string",
        "enum": ["spring_pop", "slide_up", "fade_in", "none"],
        "default": "spring_pop"
      }
    },
    "required": ["text"]
  }
}
```

---

### 17. `apply_punch_in_zooms`
Applies alternating punch-in zoom cuts (e.g. 1.0x to 1.12x) across video clips or at periodic intervals to maintain high viewer retention and pattern interrupts.
```json
{
  "name": "apply_punch_in_zooms",
  "description": "Applies alternating punch-in zoom cuts (e.g. 1.0x to 1.12x) across video clips or at periodic intervals to maintain high viewer retention and pattern interrupts.",
  "parameters": {
    "type": "object",
    "properties": {
      "clip_id": { "type": "string", "description": "Optional specific clip ID. If omitted, applies across the active video track." },
      "interval_seconds": { "type": "number", "default": 4.0 },
      "zoom_scale": { "type": "number", "default": 1.12 },
      "center_focus": {
        "type": "string",
        "enum": ["speaker_face", "center"],
        "default": "speaker_face"
      },
      "animation_type": {
        "type": "string",
        "enum": ["hard_cut", "smooth_spring"],
        "default": "hard_cut"
      }
    }
  }
}
```

---

### 18. `auto_retention_edit`
Executes the full viral retention editing pipeline in one click: 9:16 vertical reframe with face tracking, periodic punch-in zoom pattern interrupts, animated kinetic captions, ducked BGM, and Foley SFX hits.
```json
{
  "name": "auto_retention_edit",
  "description": "Executes the full viral retention editing pipeline in one click: 9:16 vertical reframe with face tracking, periodic punch-in zoom pattern interrupts, animated kinetic captions, ducked BGM, and Foley SFX hits.",
  "parameters": {
    "type": "object",
    "properties": {
      "target_ratio": {
        "type": "string",
        "enum": ["9:16", "16:9"],
        "default": "9:16"
      },
      "caption_style": {
        "type": "string",
        "enum": ["karaoke_bounce", "bold_yellow_highlight", "clean_white"],
        "default": "karaoke_bounce"
      },
      "punch_in_zooms": { "type": "boolean", "default": true },
      "add_bgm": { "type": "boolean", "default": true },
      "bgm_asset_id": { "type": "string", "default": "asset_bgm_ambient" },
      "add_sfx_transitions": { "type": "boolean", "default": true }
    }
  }
}
```

---

## Execution rules for all tools

1. **Schema-validated.** Arguments are validated before execution; invalid input returns a typed
   error and mutates nothing.
2. **Transactional.** A multi-tool agent run is wrapped in one compound command so a single undo
   reverts the whole run (research §23).
3. **Non-destructive.** Tools edit the sequence model; they never modify source media.
4. **Rational time.** All time parameters are resolved to exact rational values, never floats.
5. **No fake success.** An unimplemented tool returns an explicit `not_implemented` error
   (invariant §5.5 of `AGENTS.md`).
