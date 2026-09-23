use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

lazy_static::lazy_static! {
    static ref PROXY_TASKS: Mutex<HashMap<String, ProxyProgressNative>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyProgressNative {
    pub task_id: String,
    pub status: String, // "processing", "done", "failed"
    pub percent: f64,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ProxyPreset {
    pub id: String,
    pub name: String,
    pub target_height: u32,
    pub codec: String,
    pub description: String,
}

/// R26.4 — curated proxy presets (resolution + codec pairs the UI offers).
pub fn proxy_presets() -> Vec<ProxyPreset> {
    vec![
        ProxyPreset {
            id: "proxy-720p-h264".to_string(),
            name: "720p H.264".to_string(),
            target_height: 720,
            codec: "h264".to_string(),
            description: "Default: small files, universal playback".to_string(),
        },
        ProxyPreset {
            id: "proxy-540p-h264".to_string(),
            name: "540p H.264".to_string(),
            target_height: 540,
            codec: "h264".to_string(),
            description: "Lighter previews for long timelines".to_string(),
        },
        ProxyPreset {
            id: "proxy-360p-h264".to_string(),
            name: "360p H.264".to_string(),
            target_height: 360,
            codec: "h264".to_string(),
            description: "Minimal preview size, fastest scrub".to_string(),
        },
        ProxyPreset {
            id: "proxy-720p-prores".to_string(),
            name: "720p ProRes Proxy".to_string(),
            target_height: 720,
            codec: "prores".to_string(),
            description: "Edit-friendly intra-frame proxy (larger files)".to_string(),
        },
    ]
}

/// R26.4 — allowlist for proxy codecs. Unknown codecs are rejected loudly;
/// the old silent fallback to h264 is gone.
pub fn validate_proxy_codec(codec: &str) -> Result<&str, String> {
    if codec.eq_ignore_ascii_case("h264") {
        Ok("h264")
    } else if codec.eq_ignore_ascii_case("prores") {
        Ok("prores")
    } else {
        Err(format!(
            "Unsupported proxy codec '{}' (expected 'h264' or 'prores')",
            codec
        ))
    }
}

pub fn proxy_extension(codec: &str) -> &str {
    if codec.eq_ignore_ascii_case("prores") {
        "mov"
    } else {
        "mp4"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyTaskConfig {
    pub input_path: String,
    pub output_path: Option<String>,
    pub target_height: Option<u32>,
    pub codec: Option<String>, // "h264" (default) or "prores"
}

pub struct ProxyEngine;

impl ProxyEngine {
    /// Builds the FFmpeg arguments for proxy generation
    pub fn build_proxy_args(
        input_path: &str,
        output_path: &str,
        target_height: u32,
        codec: &str,
    ) -> Vec<String> {
        let mut args = vec![
            "-y".to_string(),
            "-i".to_string(),
            input_path.to_string(),
            "-vf".to_string(),
            format!("scale=-2:{}", target_height),
        ];

        if codec.eq_ignore_ascii_case("prores") {
            args.push("-c:v".to_string());
            args.push("prores_ks".to_string());
            args.push("-profile:v".to_string());
            args.push("0".to_string()); // ProRes Proxy profile
        } else {
            args.push("-c:v".to_string());
            args.push("libx264".to_string());
            args.push("-preset".to_string());
            args.push("veryfast".to_string());
            args.push("-crf".to_string());
            args.push("23".to_string());
        }

        // Standard AAC audio
        args.push("-c:a".to_string());
        args.push("aac".to_string());
        args.push("-b:a".to_string());
        args.push("128k".to_string());

        args.push(output_path.to_string());
        args
    }

    /// Determines the standard proxy output path if none is supplied
    pub fn default_proxy_path(input_path: &str) -> String {
        Self::default_proxy_path_for(input_path, "h264")
    }

    /// R26.4 — codec-aware default path (.mp4 for h264, .mov for prores).
    pub fn default_proxy_path_for(input_path: &str, codec: &str) -> String {
        let path = Path::new(input_path);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("media");
        let parent = path.parent().and_then(|p| p.to_str()).unwrap_or(".");
        format!("{}/{}.proxy.{}", parent, stem, proxy_extension(codec))
    }

    /// Launches an asynchronous background proxy generation task
    pub fn start_proxy_task(config: ProxyTaskConfig) -> Result<String, String> {
        if config.input_path.is_empty() {
            return Err("Input path cannot be empty".to_string());
        }

        if !Path::new(&config.input_path).exists() {
            return Err(format!("Source media file not found: {}", config.input_path));
        }

        let target_height = config.target_height.unwrap_or(720);
        let codec_raw = config.codec.clone().unwrap_or_else(|| "h264".to_string());
        let codec = validate_proxy_codec(&codec_raw)?.to_string();
        let output_path = config
            .output_path
            .unwrap_or_else(|| Self::default_proxy_path_for(&config.input_path, &codec));

        let task_id = Uuid::new_v4().to_string();

        {
            let mut tasks = PROXY_TASKS.lock().unwrap();
            tasks.insert(
                task_id.clone(),
                ProxyProgressNative {
                    task_id: task_id.clone(),
                    status: "processing".to_string(),
                    percent: 0.0,
                    output_path: Some(output_path.clone()),
                    error: None,
                },
            );
        }

        let task_id_clone = task_id.clone();
        let input_clone = config.input_path.clone();
        let output_clone = output_path.clone();

        tokio::spawn(async move {
            let args = Self::build_proxy_args(&input_clone, &output_clone, target_height, &codec);

            let mut child = match {
                let mut cmd = Command::new("ffmpeg");
                cmd.args(&args)
                   .stderr(Stdio::piped())
                   .stdout(Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    #[allow(unused_imports)]
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }
                cmd.spawn()
            }
            {
                Ok(child) => child,
                Err(e) => {
                    let mut tasks = PROXY_TASKS.lock().unwrap();
                    if let Some(task) = tasks.get_mut(&task_id_clone) {
                        task.status = "failed".to_string();
                        task.error = Some(format!("Failed to spawn ffmpeg: {}", e));
                    }
                    return;
                }
            };

            let stderr = child.stderr.take();
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    if line.contains("time=") {
                        let mut tasks = PROXY_TASKS.lock().unwrap();
                        if let Some(task) = tasks.get_mut(&task_id_clone) {
                            task.percent = (task.percent + 5.0).min(99.0);
                        }
                    }
                }
            }

            match child.wait().await {
                Ok(status) => {
                    let mut tasks = PROXY_TASKS.lock().unwrap();
                    if let Some(task) = tasks.get_mut(&task_id_clone) {
                        if status.success() {
                            task.status = "done".to_string();
                            task.percent = 100.0;
                        } else {
                            task.status = "failed".to_string();
                            task.error = Some(format!("FFmpeg exited with error code {:?}", status.code()));
                        }
                    }
                }
                Err(e) => {
                    let mut tasks = PROXY_TASKS.lock().unwrap();
                    if let Some(task) = tasks.get_mut(&task_id_clone) {
                        task.status = "failed".to_string();
                        task.error = Some(format!("Error awaiting ffmpeg process: {}", e));
                    }
                }
            }
        });

        Ok(task_id)
    }

    /// Polls proxy generation task progress
    pub fn poll_proxy_task(task_id: &str) -> Result<ProxyProgressNative, String> {
        let tasks = PROXY_TASKS.lock().unwrap();
        match tasks.get(task_id) {
            Some(task) => Ok(task.clone()),
            None => Err(format!("Proxy task {} not found", task_id)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_presets() {
        let presets = proxy_presets();
        assert_eq!(presets.len(), 4);
        assert_eq!(presets[0].id, "proxy-720p-h264");
        assert_eq!(presets[3].codec, "prores");
        for p in &presets {
            assert!(validate_proxy_codec(&p.codec).is_ok(), "preset codec {} must validate", p.codec);
        }
    }

    #[test]
    fn test_validate_proxy_codec() {
        assert_eq!(validate_proxy_codec("h264").unwrap(), "h264");
        assert_eq!(validate_proxy_codec("H264").unwrap(), "h264");
        assert_eq!(validate_proxy_codec("prores").unwrap(), "prores");
        assert!(validate_proxy_codec("hevc").is_err());
        assert!(validate_proxy_codec("").is_err());
    }

    #[test]
    fn test_default_proxy_path_extension() {
        assert_eq!(ProxyEngine::default_proxy_path_for("/media/foo/bar.mp4", "h264"), "/media/foo/bar.proxy.mp4");
        assert_eq!(ProxyEngine::default_proxy_path_for("/media/foo/bar.mp4", "prores"), "/media/foo/bar.proxy.mov");
        assert_eq!(ProxyEngine::default_proxy_path("/media/foo/bar.mp4"), "/media/foo/bar.proxy.mp4");
    }

    #[test]
    fn test_build_proxy_args_prores_and_h264() {
        let h264 = ProxyEngine::build_proxy_args("/in.mp4", "/out.mp4", 720, "h264");
        assert!(h264.contains(&"libx264".to_string()));
        assert!(h264.contains(&"scale=-2:720".to_string()));
        let prores = ProxyEngine::build_proxy_args("/in.mp4", "/out.mov", 720, "prores");
        assert!(prores.contains(&"prores_ks".to_string()));
    }

    #[test]
    fn test_start_proxy_task_rejects_unknown_codec() {
        // Use a real temp file path to pass existence check, then invalid codec
        let tmp = tempfile::NamedTempFile::new().expect("tempfile");
        let path = tmp.path().to_str().unwrap().to_string();
        // Ensure file exists
        std::fs::write(&path, b"dummy").unwrap();
        let cfg = ProxyTaskConfig {
            input_path: path,
            output_path: None,
            target_height: Some(360),
            codec: Some("hevc".to_string()),
        };
        let res = ProxyEngine::start_proxy_task(cfg);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Unsupported proxy codec"));
    }
}
