use serde::{Deserialize, Serialize};
use std::process::Command;
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    /// Probe media metadata using actual ffprobe binary
    pub fn probe_file(file_path: &str) -> Result<MediaProbeInfo, String> {
        if file_path.is_empty() {
            return Err("Invalid media file path provided".to_string());
        }

        let path_obj = std::path::Path::new(file_path);
        if !path_obj.exists() {
            return Err(format!("Media file not found on disk: {}", file_path));
        }

        let output = Command::new("ffprobe")
            .args(&[
                "-v", "error",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                file_path,
            ])
            .output()
            .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ffprobe returned error: {}", stderr));
        }

        let output_str = String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid utf-8 from ffprobe: {}", e))?;

        let metadata: Value = serde_json::from_str(&output_str)
            .map_err(|e| format!("Failed to parse ffprobe json: {}", e))?;

        let streams = metadata["streams"]
            .as_array()
            .ok_or("No streams found in ffprobe output")?;

        let mut video_stream: Option<&Value> = None;
        let mut audio_stream: Option<&Value> = None;

        for stream in streams {
            if let Some(codec_type) = stream["codec_type"].as_str() {
                if codec_type == "video" && video_stream.is_none() {
                    video_stream = Some(stream);
                } else if codec_type == "audio" && audio_stream.is_none() {
                    audio_stream = Some(stream);
                }
            }
        }

        let video = video_stream.ok_or("No video stream found")?;

        let width = video["width"].as_u64().unwrap_or(0) as u32;
        let height = video["height"].as_u64().unwrap_or(0) as u32;
        let codec = video["codec_name"].as_str().unwrap_or("unknown").to_string();

        let mut fps = 0.0;
        if let Some(r_frame_rate) = video["r_frame_rate"].as_str() {
            let parts: Vec<&str> = r_frame_rate.split('/').collect();
            if parts.len() == 2 {
                if let (Ok(num), Ok(den)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                    if den > 0.0 {
                        fps = num / den;
                    }
                }
            }
        }

        let duration_seconds = if let Some(duration_str) = metadata["format"]["duration"].as_str() {
            duration_str.parse::<f64>().unwrap_or(0.0)
        } else if let Some(duration_str) = video["duration"].as_str() {
            duration_str.parse::<f64>().unwrap_or(0.0)
        } else {
            0.0
        };

        let has_audio = audio_stream.is_some();
        let sample_rate = audio_stream.and_then(|a| a["sample_rate"].as_str().and_then(|sr| sr.parse::<u32>().ok()));

        let filename = path_obj.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string();

        Ok(MediaProbeInfo {
            path: file_path.to_string(),
            filename,
            duration_seconds,
            width,
            height,
            fps,
            codec,
            has_audio,
            sample_rate,
        })
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_probe_file() {
        // Create a 2s 320x240 30fps test file using ffmpeg
        let temp_file = NamedTempFile::new().expect("failed to create temp file");
        let path = temp_file.path().to_str().unwrap().to_string();

        let output = Command::new("ffmpeg")
            .args(&[
                "-y", // overwrite
                "-f", "lavfi",
                "-i", "testsrc=size=320x240:rate=30",
                "-t", "2",
                "-c:v", "libx264",
                "-f", "mp4",
                &path,
            ])
            .output()
            .expect("Failed to generate test video with ffmpeg");

        assert!(output.status.success(), "ffmpeg generation failed: {}", String::from_utf8_lossy(&output.stderr));

        let probe_result = FFmpegDemuxerEngine::probe_file(&path);
        assert!(probe_result.is_ok(), "probe_file failed: {:?}", probe_result.err());

        let info = probe_result.unwrap();
        assert_eq!(info.width, 320);
        assert_eq!(info.height, 240);
        assert_eq!(info.fps, 30.0);
        assert_eq!(info.codec, "h264");
        assert!(!info.has_audio);
        // duration might not be exactly 2.0 due to encoding quirks, but should be close
        assert!((info.duration_seconds - 2.0).abs() < 0.1);

        // test missing file
        let missing_result = FFmpegDemuxerEngine::probe_file("/non/existent/path.mp4");
        assert!(missing_result.is_err());
    }
}
