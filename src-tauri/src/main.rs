// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod ffmpeg_demuxer;
pub mod whisper_onnx;
pub mod silero_vad;
pub mod export_native;

use ffmpeg_demuxer::{FFmpegDemuxerEngine, MediaProbeInfo, DemuxedFrame};
use whisper_onnx::{WhisperOnnxEngine, WhisperTranscriptNative};
use silero_vad::{SileroVadEngine, SilenceSegmentNative};
use export_native::{HardwareExportNative, ExportTaskConfig, FFmpegCommandSpec};

#[tauri::command]
fn open_media_file_dialog(file_path: String) -> Result<MediaProbeInfo, String> {
    FFmpegDemuxerEngine::probe_file(&file_path)
}

#[tauri::command]
fn demux_video_frames(file_path: String, start_time: f64, frame_count: u32) -> Result<Vec<DemuxedFrame>, String> {
    FFmpegDemuxerEngine::extract_frames(&file_path, start_time, frame_count)
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_media_file_dialog,
            demux_video_frames,
            run_whisper_stt,
            detect_vad_silence,
            get_export_ffmpeg_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running CineCraft AI Tauri application");
}
