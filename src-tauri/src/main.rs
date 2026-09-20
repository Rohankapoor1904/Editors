// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod ffmpeg_demuxer;
pub mod whisper_onnx;
pub mod silero_vad;
pub mod export_native;
pub mod proxy_engine;
pub mod audio_separation;
pub mod voice_denoise;

use ffmpeg_demuxer::{FFmpegDemuxerEngine, MediaProbeInfo};
use whisper_onnx::{WhisperTranscriptNative, WhisperOnnxEngine};
use silero_vad::{SilenceSegmentNative, SileroVadEngine};
use export_native::{ExportProgress, ExportTaskConfig, FFmpegCommandSpec, HardwareExportNative};
use proxy_engine::{ProxyEngine, ProxyProgressNative, ProxyTaskConfig};
use audio_separation::{AudioSeparationConfig, AudioSeparationEngine, SeparationResultNative};
use voice_denoise::{DenoiseResultNative, VoiceDenoiseConfig, VoiceDenoiseEngine};

use tokio::fs::File;
use tokio::io::AsyncReadExt;
use sha2::{Sha256, Digest};

#[tauri::command]
async fn get_file_fingerprint(file_path: String) -> Result<String, String> {
    let mut file = File::open(&file_path).await.map_err(|e| format!("Failed to open file: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];

    loop {
        let count = file.read(&mut buffer).await.map_err(|e| format!("Failed to read file: {}", e))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(hex::encode(hasher.finalize()))
}

#[tauri::command]
fn check_file_exists(file_path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&file_path).exists())
}

#[tauri::command]
fn probe_media_file(file_path: String) -> Result<MediaProbeInfo, String> {
    FFmpegDemuxerEngine::probe_file(&file_path)
}

#[tauri::command]
fn demux_video_frames(file_path: String, start_time: f64, frame_count: u32) -> Result<tauri::ipc::Response, String> {
    let raw_bytes = FFmpegDemuxerEngine::extract_frames_bytes(&file_path, start_time, frame_count)?;
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            denoise_audio_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineCraft AI Tauri application");
}

#[cfg(test)]
mod tests {
    include!("tests/contract_test.rs");
}
