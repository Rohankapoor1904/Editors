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
        let path = Path::new(input_path);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("media");
        let parent = path.parent().and_then(|p| p.to_str()).unwrap_or(".");
        format!("{}/{}.proxy.mp4", parent, stem)
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
        let codec = config.codec.unwrap_or_else(|| "h264".to_string());
        let output_path = config
            .output_path
            .unwrap_or_else(|| Self::default_proxy_path(&config.input_path));

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
