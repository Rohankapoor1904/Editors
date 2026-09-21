use serde::{Deserialize, Serialize};
use serde_json::Value;
use crate::process_utils::silent_command;

fn to_base64(data: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARSET[(n >> 18) & 63] as char);
        out.push(CHARSET[(n >> 12) & 63] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(n >> 6) & 63] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[n & 63] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
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
    pub thumbnail_data_url: Option<String>,
}

pub struct FFmpegDemuxerEngine;

impl FFmpegDemuxerEngine {
    /// Extract a quick JPEG thumbnail as bytes (scaled to 320px width)
    pub fn extract_thumbnail_bytes(file_path: &str) -> Result<Vec<u8>, String> {
        let output = silent_command("ffmpeg")
            .args(&[
                "-v", "error",
                "-ss", "0.5",
                "-i", file_path,
                "-vframes", "1",
                "-vf", "scale=320:-1",
                "-f", "image2",
                "-c:v", "mjpeg",
                "-",
            ])
            .output();

        if let Ok(out) = output {
            if out.status.success() && !out.stdout.is_empty() {
                return Ok(out.stdout);
            }
        }

        // Fallback at start timestamp 0
        let fallback = silent_command("ffmpeg")
            .args(&[
                "-v", "error",
                "-ss", "0",
                "-i", file_path,
                "-vframes", "1",
                "-vf", "scale=320:-1",
                "-f", "image2",
                "-c:v", "mjpeg",
                "-",
            ])
            .output()
            .map_err(|e| format!("Failed to generate thumbnail: {}", e))?;

        if fallback.status.success() && !fallback.stdout.is_empty() {
            Ok(fallback.stdout)
        } else {
            Err("Empty thumbnail from ffmpeg".to_string())
        }
    }

    /// Probe media metadata using actual ffprobe binary
    pub fn probe_file(file_path: &str) -> Result<MediaProbeInfo, String> {
        if file_path.is_empty() {
            return Err("Invalid media file path provided".to_string());
        }

        let path_obj = std::path::Path::new(file_path);
        if !path_obj.exists() {
            return Err(format!("Media file not found on disk: {}", file_path));
        }

        let output = silent_command("ffprobe")
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

        let thumbnail_data_url = if video_stream.is_some() {
            Self::extract_thumbnail_bytes(file_path)
                .ok()
                .filter(|b| !b.is_empty())
                .map(|bytes| format!("data:image/jpeg;base64,{}", to_base64(&bytes)))
        } else {
            None
        };

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
            thumbnail_data_url,
        })
    }

    /// Extract raw video frame buffers directly to avoid serialization overhead.
    /// Returns raw YUV420P concatenated byte array.
    pub fn extract_frames_bytes(
        file_path: &str,
        start_time_sec: f64,
        frame_count: u32,
    ) -> Result<Vec<u8>, String> {
        let path_obj = std::path::Path::new(file_path);
        if !path_obj.exists() {
            return Err(format!("Media file not found on disk: {}", file_path));
        }

        let output = silent_command("ffmpeg")
            .args(&[
                "-v", "error",
                "-ss", &start_time_sec.to_string(),
                "-i", file_path,
                "-frames:v", &frame_count.to_string(),
                "-f", "image2pipe",
                "-pix_fmt", "yuv420p",
                "-vcodec", "rawvideo",
                "-",
            ])
            .output()
            .map_err(|e| format!("Failed to execute ffmpeg for frame extraction: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ffmpeg extraction error: {}", stderr));
        }

        Ok(output.stdout)
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

        let output = silent_command("ffmpeg")
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

    #[test]
    fn test_extract_frames() {
        let temp_file = NamedTempFile::new().expect("failed to create temp file");
        let path = temp_file.path().to_str().unwrap().to_string();

        // Create a 1s 320x240 10fps test file using ffmpeg
        let output = silent_command("ffmpeg")
            .args(&[
                "-y", // overwrite
                "-f", "lavfi",
                "-i", "testsrc=size=320x240:rate=10",
                "-t", "1",
                "-c:v", "libx264",
                "-f", "mp4",
                &path,
            ])
            .output()
            .expect("Failed to generate test video with ffmpeg");

        assert!(output.status.success(), "ffmpeg generation failed: {}", String::from_utf8_lossy(&output.stderr));

        let raw_bytes = FFmpegDemuxerEngine::extract_frames_bytes(&path, 0.0, 5).unwrap();
        let expected_size = (320 * 240 * 3 / 2) as usize;
        assert_eq!(raw_bytes.len(), expected_size * 5);

        // checksum a mid-frame (frame index 2)
        let mid_frame_start = 2 * expected_size;
        let mid_frame_end = mid_frame_start + expected_size;
        let mid_frame_bytes = &raw_bytes[mid_frame_start..mid_frame_end];

        let sum: u64 = mid_frame_bytes.iter().map(|&b| b as u64).sum();
        assert!(sum > 0);
    }
}
