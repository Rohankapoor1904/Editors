use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTaskConfig {
    pub preset_name: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub bitrate_mbps: u32,
    pub encoder: String, // e.g., "NVENC (NVIDIA)" or "VideoToolbox (Apple)"
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FFmpegCommandSpec {
    pub binary: String,
    pub args: Vec<String>,
}

pub struct HardwareExportNative;

impl HardwareExportNative {
    /// Generates hardware-accelerated FFmpeg command flags based on hardware encoder choice
    pub fn build_ffmpeg_command(config: &ExportTaskConfig) -> FFmpegCommandSpec {
        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(),
            "rawvideo".to_string(),
            "-pix_fmt".to_string(),
            "rgba".to_string(),
            "-s".to_string(),
            format!("{}x{}", config.width, config.height),
            "-r".to_string(),
            format!("{:.2}", config.fps),
            "-i".to_string(),
            "pipe:0".to_string(),
        ];

        // Select GPU hardware encoder flags
        match config.encoder.as_str() {
            "NVENC (NVIDIA)" => {
                args.push("-c:v".to_string());
                args.push("h264_nvenc".to_string());
                args.push("-preset".to_string());
                args.push("p4".to_string());
                args.push("-cq".to_string());
                args.push("20".to_string());
                args.push("-b:v".to_string());
                args.push(format!("{}M", config.bitrate_mbps));
            }
            "VideoToolbox (Apple)" => {
                args.push("-c:v".to_string());
                args.push("h264_videotoolbox".to_string());
                args.push("-realtime".to_string());
                args.push("true".to_string());
                args.push("-b:v".to_string());
                args.push(format!("{}M", config.bitrate_mbps));
            }
            "QuickSync (Intel)" => {
                args.push("-c:v".to_string());
                args.push("h264_qsv".to_string());
                args.push("-global_quality".to_string());
                args.push("20".to_string());
            }
            _ => {
                args.push("-c:v".to_string());
                args.push("libx264".to_string());
                args.push("-preset".to_string());
                args.push("medium".to_string());
                args.push("-crf".to_string());
                args.push("18".to_string());
            }
        }

        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-b:a".to_string());
        args.push("320k".to_string());
        args.push(config.output_path.clone());

        FFmpegCommandSpec {
            binary: "ffmpeg".to_string(),
            args,
        }
    }
}
