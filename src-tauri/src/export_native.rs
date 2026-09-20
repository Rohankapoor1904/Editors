use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Mutex;
use std::collections::HashMap;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;
use crate::ffmpeg_demuxer::FFmpegDemuxerEngine;

lazy_static::lazy_static! {
    static ref EXPORT_TASKS: Mutex<HashMap<String, ExportProgress>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportTaskConfig {
    pub preset_name: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub bitrate_mbps: u32,
    pub encoder: String, // e.g., "NVENC (NVIDIA)" or "VideoToolbox (Apple)"
    pub output_path: String,
    pub target_lufs: Option<f64>,
    pub color_space: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FFmpegCommandSpec {
    pub binary: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProgress {
    pub status: String, // "processing", "done", "failed"
    pub percent: f64,
    pub error: Option<String>,
}

pub struct HardwareExportNative;

impl HardwareExportNative {
    /// Generates hardware-accelerated FFmpeg command flags based on hardware encoder choice
    pub fn build_ffmpeg_command(config: &ExportTaskConfig) -> FFmpegCommandSpec {
        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(),
            "lavfi".to_string(),
            "-i".to_string(),
            format!("testsrc=duration=5:size={}x{}:rate={}", config.width, config.height, config.fps),
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
            "AMF (AMD)" => {
                args.push("-c:v".to_string());
                args.push("h264_amf".to_string());
                args.push("-quality".to_string());
                args.push("speed".to_string());
            }
            _ => {
                args.push("-c:v".to_string());
                args.push("libx264".to_string());
                args.push("-preset".to_string());
                args.push("ultrafast".to_string()); // use ultrafast for testsrc
            }
        }

        // Colorimetry metadata tagging
        let cs = config.color_space.as_deref().unwrap_or("bt709");
        if cs == "bt2020" {
            args.push("-colorspace".to_string());
            args.push("bt2020nc".to_string());
            args.push("-color_primaries".to_string());
            args.push("bt2020".to_string());
            args.push("-color_trc".to_string());
            args.push("smpte2084".to_string());
        } else {
            args.push("-colorspace".to_string());
            args.push("bt709".to_string());
            args.push("-color_primaries".to_string());
            args.push("bt709".to_string());
            args.push("-color_trc".to_string());
            args.push("bt709".to_string());
        }

        // Audio normalization (Roadmap R18.2)
        if let Some(target_lufs) = config.target_lufs {
            args.push("-af".to_string());
            args.push(format!("loudnorm=I={:.1}:TP=-1.5:LRA=11", target_lufs));
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

    /// Probes available hardware encoders by running `ffmpeg -encoders`
    pub fn get_available_encoders() -> Vec<String> {
        let mut encoders = vec!["Software x264".to_string()];

        let output = match std::process::Command::new("ffmpeg").arg("-encoders").output() {
            Ok(output) => output,
            Err(_) => return encoders,
        };

        if !output.status.success() {
            return encoders;
        }

        let output_str = String::from_utf8_lossy(&output.stdout);

        if output_str.contains("h264_videotoolbox") {
            encoders.push("VideoToolbox (Apple)".to_string());
        }
        if output_str.contains("h264_nvenc") {
            encoders.push("NVENC (NVIDIA)".to_string());
        }
        if output_str.contains("h264_qsv") {
            encoders.push("QuickSync (Intel)".to_string());
        }
        if output_str.contains("h264_amf") {
            encoders.push("AMF (AMD)".to_string());
        }

        encoders
    }

    pub fn start_export_task(config: ExportTaskConfig) -> Result<String, String> {
        let task_id = Uuid::new_v4().to_string();
        let total_frames = config.fps * 5.0; // testsrc duration is 5s

        {
            let mut map = EXPORT_TASKS.lock().unwrap();
            map.insert(task_id.clone(), ExportProgress {
                status: "processing".to_string(),
                percent: 0.0,
                error: None,
            });
        }

        let cmd_spec = Self::build_ffmpeg_command(&config);
        let task_id_clone = task_id.clone();

        tokio::spawn(async move {
            let mut child = match Command::new(&cmd_spec.binary)
                .args(&cmd_spec.args)
                .stderr(Stdio::piped())
                .stdout(Stdio::null())
                .spawn() {
                Ok(c) => c,
                Err(e) => {
                    let mut map = EXPORT_TASKS.lock().unwrap();
                    map.insert(task_id_clone, ExportProgress {
                        status: "failed".to_string(),
                        percent: 0.0,
                        error: Some(format!("Failed to spawn ffmpeg: {}", e)),
                    });
                    return;
                }
            };

            let stderr = child.stderr.take().unwrap();
            let mut reader = BufReader::new(stderr).lines();

            let frame_re = regex::Regex::new(r"frame=\s*(\d+)").unwrap();
            let mut last_error_log = String::new();

            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(caps) = frame_re.captures(&line) {
                    if let Ok(frame_num) = caps[1].parse::<f64>() {
                        let percent = (frame_num / total_frames * 100.0).clamp(0.0, 99.0);
                        let mut map = EXPORT_TASKS.lock().unwrap();
                        if let Some(progress) = map.get_mut(&task_id_clone) {
                            progress.percent = percent;
                        }
                    }
                }
                last_error_log.push_str(&line);
                last_error_log.push('\n');
                if last_error_log.len() > 4096 {
                    let trim_idx = last_error_log.len() - 4096;
                    last_error_log = last_error_log[trim_idx..].to_string();
                }
            }

            match child.wait().await {
                Ok(status) if status.success() => {
                    // Check if file is ffprobe-able
                    match FFmpegDemuxerEngine::probe_file(&config.output_path) {
                        Ok(_) => {
                            let mut map = EXPORT_TASKS.lock().unwrap();
                            if let Some(progress) = map.get_mut(&task_id_clone) {
                                progress.status = "done".to_string();
                                progress.percent = 100.0;
                            }
                        }
                        Err(e) => {
                            let mut map = EXPORT_TASKS.lock().unwrap();
                            if let Some(progress) = map.get_mut(&task_id_clone) {
                                progress.status = "failed".to_string();
                                progress.error = Some(format!("Export completed but ffprobe failed: {}", e));
                            }
                        }
                    }
                }
                Ok(status) => {
                    let mut map = EXPORT_TASKS.lock().unwrap();
                    if let Some(progress) = map.get_mut(&task_id_clone) {
                        progress.status = "failed".to_string();
                        progress.error = Some(format!("ffmpeg exited with {:?}\nLog: {}", status, last_error_log));
                    }
                }
                Err(e) => {
                    let mut map = EXPORT_TASKS.lock().unwrap();
                    if let Some(progress) = map.get_mut(&task_id_clone) {
                        progress.status = "failed".to_string();
                        progress.error = Some(format!("Failed to wait for ffmpeg: {}", e));
                    }
                }
            }
        });

        Ok(task_id)
    }

    pub async fn poll_export_task(id: String, last_percent: f64) -> Result<ExportProgress, String> {
        // Long poll: check up to 50 times (5 seconds)
        for _ in 0..50 {
            {
                let map = EXPORT_TASKS.lock().unwrap();
                if let Some(progress) = map.get(&id) {
                    if progress.status != "processing" || (progress.percent - last_percent).abs() > 0.001 {
                        return Ok(progress.clone());
                    }
                } else {
                    return Err("Task not found".to_string());
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        let map = EXPORT_TASKS.lock().unwrap();
        if let Some(progress) = map.get(&id) {
            Ok(progress.clone())
        } else {
            Err("Task not found".to_string())
        }
    }
}
