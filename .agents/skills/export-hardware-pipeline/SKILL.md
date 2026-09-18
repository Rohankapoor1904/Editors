---
name: export-hardware-pipeline
description: >-
  Hardware-accelerated video export and FFmpeg encoding pipeline for CineCraft AI.
  Use when implementing real hardware encoder detection (NVENC, QSV, VideoToolbox),
  frame-by-frame timeline export, color space tags, and batch export queuing (Phase R8).
---

# Export & Hardware Encoding Pipeline (Phase R8)

This skill governs the production export subsystem, hardware encoder selection, and batch rendering queue in CineCraft AI.

## 1. Encoder Capability Detection (R8.2)

1. **Hardware Encoder Hierarchy**:
   - **NVIDIA**: `h264_nvenc`, `hevc_nvenc`, `av1_nvenc`
   - **Apple Silicon**: `h264_videotoolbox`, `hevc_videotoolbox`
   - **Intel**: `h264_qsv`, `hevc_qsv`
   - **AMD**: `h264_amf`, `hevc_amf`
   - **Software Fallback**: `libx264`, `libx265`, `libsvtav1`

2. **Probe Command in Rust**:
   - Query FFmpeg encoders at app startup:
     ```bash
     ffmpeg -encoders | grep -E "nvenc|videotoolbox|qsv|amf"
     ```
   - Store detected hardware capabilities in the system store. Display available hardware presets in `ExportModal.tsx`.

## 2. Real Frame-by-Frame Timeline Export (R8.1)

- **The Pipeline**:
  1. Initialize FFmpeg subprocess with an input pipe expecting raw RGBA or YUV420p frames:
     ```bash
     ffmpeg -f rawvideo -pix_fmt rgba -s 3840x2160 -r 60 -i - \
            -c:v h264_nvenc -preset p7 -cq 19 -b:v 0 \
            -c:a aac -b:a 320k output.mp4
     ```
  2. For each sequence frame `0 .. totalFrames - 1`:
     - Render the DAG graph at that exact `RationalTime`.
     - Read back the composited GPU texture to a staging buffer (`copyTextureToBuffer`).
     - Map buffer asynchronously (`mapAsync(GPUMapMode.READ)`).
     - Pipe raw byte buffer directly into FFmpeg stdin.
     - Emit progress percentage to UI `ExportModal`.
  3. Close stdin pipe and wait for FFmpeg to finalize container moov atom.

- **No Fake Progress Loops (Anti-Pattern Prevention)**:
  - Never use `setInterval` or fake timer loops to pretend export is happening.
  - Actual written byte counts and FFmpeg stdout timestamps drive the export progress bar.

## 3. Color Space & HDR Tagging

Ensure output container is tagged with exact colorimetry metadata:
- **SDR Rec.709**: `-colorspace bt709 -color_primaries bt709 -color_trc bt709`
- **HDR HLG / PQ**: `-colorspace bt2020nc -color_primaries bt2020 -color_trc arib-std-b67` (or `smpte2084`)

## 4. Batch Export Queue (R8.3)

- User can queue multiple render targets (e.g. 4K Master ProRes 422HQ, 1080p YouTube H.264, 9:16 TikTok Vertical).
- Manage queue through a FIFO worker thread with pause, cancel, and priority re-ordering.
