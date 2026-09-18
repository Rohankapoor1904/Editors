---
name: backend-tauri-rust
description: >-
  Tauri 2.0 Rust native backend architecture for CineCraft AI.
  Use when developing, debugging, or extending Rust commands in src-tauri, native media probes,
  FFmpeg demuxing, ONNX Runtime (ort) models, and zero-copy IPC boundaries.
---

# Backend Architecture: Tauri 2.0 & Rust Native Engine

This skill guides development on CineCraft AI's native engine (`src-tauri/`), handling high-throughput compute, hardware decode/encode, and AI model execution.

## 1. IPC Boundary & Command Conventions

1. **Naming & Signature**:
   - Tauri commands must follow `snake_case` `verb_noun` naming convention:
     ```rust
     #[tauri::command]
     pub async fn probe_media(file_path: String) -> Result<MediaMetadata, String> { ... }
     ```
   - All arguments must deserialize via `serde::Deserialize`.
   - All returns must serialize via `serde::Serialize` and return `Result<T, String>`.

2. **TypeScript ↔ Rust Mapping**:
   - Rust fields are `snake_case`; TypeScript interfaces are `camelCase`.
   - Use `#[serde(rename_all = "camelCase")]` on Rust structs to ensure seamless TypeScript mirroring:
     ```rust
     #[derive(Serialize, Deserialize, Clone, Debug)]
     #[serde(rename_all = "camelCase")]
     pub struct MediaMetadata {
         pub duration_seconds: f64,
         pub width: u32,
         pub height: u32,
         pub frame_rate: f64,
         pub sample_rate: u32,
         pub channels: u16,
     }
     ```

3. **No Mocks on Main Execution Path (Invariant 5)**:
   - Never return hardcoded mock data in Rust commands.
   - If a backend feature is missing hardware capability or model weights, return `Err("Error: ... not available")` loudly.

## 2. Machine Learning Models via ONNX Runtime (`ort`)

- **Silero VAD (`src-tauri/src/silero_vad.rs`)**:
  - Direct PCM streaming at 16kHz mono.
  - Chunk size: 512 samples (32ms windows).
  - Maintains internal RNN states (`h`, `c`) across chunks.
- **Whisper ASR (`src-tauri/src/whisper_onnx.rs`)**:
  - Uses quantized `ggml-tiny.en.bin` or ONNX FP16 weights.
  - Audio pre-processing: 80-channel log-mel spectrogram computation.
  - Generates token timestamps for word-level transcript binding.

## 3. Hardware Acceleration & FFmpeg Demuxing

- **FFprobe / Media Probe**:
  - Extracts exact stream timebases (`1/24000`, `1001/30000`, `1/48000`).
  - Detects Variable Frame Rate (VFR) vs. Constant Frame Rate (CFR) to notify the audio master clock.
- **Video Demuxing**:
  - Demuxes H.264 / HEVC / ProRes / AV1 frames into raw YUV420p or NV12 buffers.
  - Sends raw bytes over Tauri IPC as binary payloads (`tauri::ipc::Response`) to avoid Base64 serialization overhead.

## 4. Quality & Build Verification Commands

When touching Rust code, always run:
```bash
cd src-tauri
cargo check
cargo test
cargo clippy -- -D warnings
```
Ensure dependencies in `Cargo.toml` specify exact compatible crate versions.
