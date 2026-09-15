use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaProbeInfo {
    pub path: String,
    pub filename: String,
    pub duration_seconds: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub has_audio: bool,
    pub sample_rate: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DemuxedFrame {
    pub frame_index: u64,
    pub timestamp_pts: f64,
    pub width: u32,
    pub height: u32,
    pub format: String, // e.g. "YUV420P" or "RGBA"
    pub data_buffer_len: usize,
}

pub struct FFmpegDemuxerEngine;

impl FFmpegDemuxerEngine {
    /// Probe media metadata using Rust/FFmpeg demuxing wrapper
    pub fn probe_file(file_path: &str) -> Result<MediaProbeInfo, String> {
        if file_path.is_empty() {
            return Err("Invalid media file path provided".to_string());
        }

        let path_obj = std::path::Path::new(file_path);
        if !path_obj.exists() {
            return Err(format!("Media file not found on disk: {}", file_path));
        }

        // INVARIANT §5.5: Fail loudly rather than returning silent mock data on main path
        Err(format!(
            "Native media probe requires real ffprobe pipeline integration (see Roadmap R1.3). File: {}",
            file_path
        ))
    }

    /// Extract video frame buffers at given timestamp interval using native demuxing
    pub fn extract_frames(
        file_path: &str,
        _start_time_sec: f64,
        _frame_count: u32,
    ) -> Result<Vec<DemuxedFrame>, String> {
        let path_obj = std::path::Path::new(file_path);
        if !path_obj.exists() {
            return Err(format!("Media file not found on disk: {}", file_path));
        }

        // INVARIANT §5.5: Fail loudly rather than returning silent mock data on main path
        Err(format!(
            "Native frame extraction requires FFmpeg decoding pipeline integration (see Roadmap R2.1). File: {}",
            file_path
        ))
    }
}
