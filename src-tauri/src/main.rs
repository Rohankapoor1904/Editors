// Prevents additional console window on Windows in both debug and release
#![windows_subsystem = "windows"]

pub mod ffmpeg_demuxer;
pub mod whisper_onnx;
pub mod silero_vad;
pub mod export_native;
pub mod proxy_engine;
pub mod audio_separation;
pub mod voice_denoise;
pub mod process_utils;
pub mod audio_conformance;
pub mod bridge_server;

use ffmpeg_demuxer::{FFmpegDemuxerEngine, MediaProbeInfo};
use whisper_onnx::{WhisperTranscriptNative, WhisperOnnxEngine};
use silero_vad::{SilenceSegmentNative, SileroVadEngine};
use export_native::{ExportProgress, ExportTaskConfig, FFmpegCommandSpec, HardwareExportNative};
use proxy_engine::{ProxyEngine, ProxyProgressNative, ProxyTaskConfig};
use audio_separation::{AudioSeparationConfig, AudioSeparationEngine, SeparationResultNative};
use voice_denoise::{DenoiseResultNative, VoiceDenoiseConfig, VoiceDenoiseEngine};
use bridge_server::{BridgeInfo, BridgeServerState};

use sha2::{Sha256, Digest};

#[tauri::command]
async fn get_file_fingerprint(file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        use std::fs::File;
        use std::io::{Read, Seek, SeekFrom};
        let mut file = File::open(&file_path).map_err(|e| format!("Failed to open file: {}", e))?;
        let metadata = file.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        let len = metadata.len();
        let modified = metadata.modified()
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis())
            .unwrap_or(0);

        let mut hasher = Sha256::new();
        hasher.update(len.to_le_bytes());
        hasher.update(modified.to_le_bytes());

        let mut header = vec![0u8; 65536.min(len as usize)];
        if let Ok(n) = file.read(&mut header) {
            hasher.update(&header[..n]);
        }

        if len > 65536 {
            let tail_len = (len - 65536).min(65536) as usize;
            let mut tail = vec![0u8; tail_len];
            if file.seek(SeekFrom::End(-(tail_len as i64))).is_ok() {
                if let Ok(n) = file.read(&mut tail) {
                    hasher.update(&tail[..n]);
                }
            }
        }

        Ok(hex::encode(hasher.finalize()))
    }).await.map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
fn check_file_exists(file_path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&file_path).exists())
}

/// Connection facts for the native agent-bridge sidecar (R23.2, ADR-009).
/// The frontend calls this once at startup, then polls the sidecar with the
/// exact dev-plugin protocol. Unavailable before `setup()` binds the socket.
#[tauri::command]
fn get_bridge_info(state: tauri::State<'_, BridgeServerState>) -> Result<BridgeInfo, String> {
    Ok(state.info())
}

#[tauri::command]
async fn probe_media_file(file_path: String) -> Result<MediaProbeInfo, String> {
    tokio::task::spawn_blocking(move || {
        FFmpegDemuxerEngine::probe_file(&file_path)
    }).await.map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
async fn demux_video_frames(file_path: String, start_time: f64, frame_count: u32) -> Result<tauri::ipc::Response, String> {
    let raw_bytes = tokio::task::spawn_blocking(move || {
        FFmpegDemuxerEngine::extract_frames_bytes(&file_path, start_time, frame_count)
    }).await.map_err(|e| format!("Task failed: {}", e))??;
    Ok(tauri::ipc::Response::new(raw_bytes))
}

#[tauri::command]
fn run_whisper_stt(audio_path: String) -> Result<WhisperTranscriptNative, String> {
    WhisperOnnxEngine::transcribe_audio(&audio_path)
}

#[tauri::command]
fn detect_vad_silence(audio_path: String, min_duration: f64, threshold_db: f64) -> Result<Vec<SilenceSegmentNative>, String> {
    SileroVadEngine::detect_silence(&audio_path, min_duration, threshold_db)
}

#[tauri::command]
fn get_export_ffmpeg_command(config: ExportTaskConfig) -> Result<FFmpegCommandSpec, String> {
    Ok(HardwareExportNative::build_ffmpeg_command(&config))
}

#[tauri::command]
fn start_export_task(config: ExportTaskConfig) -> Result<String, String> {
    HardwareExportNative::start_export_task(config)
}

#[tauri::command]
async fn poll_export_task(id: String, last_percent: f64) -> Result<ExportProgress, String> {
    HardwareExportNative::poll_export_task(id, last_percent).await
}

#[tauri::command]
fn get_available_encoders() -> Result<Vec<String>, String> {
    Ok(HardwareExportNative::get_available_encoders())
}

#[tauri::command]
fn generate_proxy_video(input_path: String, target_height: Option<u32>, codec: Option<String>) -> Result<String, String> {
    ProxyEngine::start_proxy_task(ProxyTaskConfig {
        input_path,
        output_path: None,
        target_height,
        codec,
    })
}

#[tauri::command]
fn poll_proxy_generation(task_id: String) -> Result<ProxyProgressNative, String> {
    ProxyEngine::poll_proxy_task(&task_id)
}

#[tauri::command]
async fn separate_audio_stems(audio_path: String, output_dir: Option<String>) -> Result<SeparationResultNative, String> {
    AudioSeparationEngine::separate_stems(AudioSeparationConfig {
        audio_path,
        output_dir,
    }).await
}

#[tauri::command]
async fn denoise_audio_file(
    audio_path: String,
    output_path: Option<String>,
    strength: Option<f32>,
    leveler_enabled: Option<bool>,
) -> Result<DenoiseResultNative, String> {
    VoiceDenoiseEngine::denoise_audio(VoiceDenoiseConfig {
        audio_path,
        output_path,
        strength,
        leveler_enabled,
    }).await
}

fn main() {
    std::panic::set_hook(Box::new(|panic_info| {
        let location = panic_info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_else(|| "unknown".to_string());
        let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };
        let err_msg = format!("CineCraft AI Fatal Crash!\nLocation: {}\nError: {}\n", location, payload);
        let _ = std::fs::write("D:\\editors\\crash.log", &err_msg);
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let app_dir = std::path::PathBuf::from(local_app_data).join("com.cinecraft.ai");
            let _ = std::fs::create_dir_all(&app_dir);
            let _ = std::fs::write(app_dir.join("crash.log"), &err_msg);
        }
    }));

    #[cfg(windows)]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let ffmpeg_bin = std::path::PathBuf::from(local_app_data)
                .join("Microsoft\\WinGet\\Packages\\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.1-essentials_build\\bin");
            if ffmpeg_bin.exists() {
                if let Ok(current_path) = std::env::var("PATH") {
                    if !current_path.contains("ffmpeg") {
                        std::env::set_var("PATH", format!("{};{}", ffmpeg_bin.display(), current_path));
                    }
                }
            }
        }
    }

    if let Err(err) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            use tauri::Manager;
            for (_label, win) in app.webview_windows() {
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.maximize();
            }
            // Native agent-bridge sidecar (R23.2, ADR-009): loopback HTTP on
            // an OS-assigned port. A bind failure is fatal — without it the
            // installed app has no agent transport at all.
            let (listener, bridge_state) = match tauri::async_runtime::block_on(
                BridgeServerState::bind_loopback(),
            ) {
                Ok(bound) => bound,
                Err(e) => {
                    return Err(Box::new(e) as Box<dyn std::error::Error>);
                }
            };
            let info = bridge_state.info();
            println!(
                "[bridge] sidecar listening on 127.0.0.1:{}",
                info.port
            );
            if let Ok(info_json) = serde_json::to_string_pretty(&info) {
                let _ = std::fs::write("target/bridge_info.json", &info_json);
                let temp_path = std::env::temp_dir().join("cinecraft_bridge_info.json");
                let _ = std::fs::write(temp_path, &info_json);
            }
            app.manage(bridge_state.clone());
            let router = bridge_state.router();
            tauri::async_runtime::spawn(async move {
                if let Err(err) = axum::serve(listener, router).await {
                    eprintln!("[bridge] sidecar serve error: {err}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            probe_media_file,
            demux_video_frames,
            run_whisper_stt,
            detect_vad_silence,
            get_export_ffmpeg_command,
            start_export_task,
            poll_export_task,
            get_available_encoders,
            get_file_fingerprint,
            check_file_exists,
            generate_proxy_video,
            poll_proxy_generation,
            separate_audio_stems,
            denoise_audio_file,
            get_bridge_info
        ])
        .run(tauri::generate_context!())
    {
        let err_msg = format!("Fatal Tauri Runtime Error: {:?}\n", err);
        let _ = std::fs::write("D:\\editors\\crash.log", &err_msg);
        eprintln!("{}", err_msg);
    }
}

#[cfg(test)]
mod tests {
    include!("tests/contract_test.rs");
}
