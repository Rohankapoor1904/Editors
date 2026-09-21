use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Mutex;
use std::collections::HashMap;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use uuid::Uuid;
use crate::ffmpeg_demuxer::FFmpegDemuxerEngine;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

lazy_static::lazy_static! {
    static ref EXPORT_TASKS: Mutex<HashMap<String, ExportProgress>> = Mutex::new(HashMap::new());
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineClipExport {
    pub asset_path: String,
    pub source_in: f64,
    pub duration: f64,
    pub start_offset: f64,
    pub is_audio: bool,
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
    #[serde(default)]
    pub clips: Option<Vec<TimelineClipExport>>,
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
        let mut args = vec!["-y".to_string()];

        let clips = config.clips.as_ref().filter(|c| !c.is_empty());
        let mut audio_in_complex_filter = false;

        if let Some(clips) = clips {
            let mut video_clips: Vec<&TimelineClipExport> = clips.iter().filter(|c| !c.is_audio).collect();
            let mut audio_clips: Vec<&TimelineClipExport> = clips.iter().filter(|c| c.is_audio).collect();

            video_clips.sort_by(|a, b| a.start_offset.partial_cmp(&b.start_offset).unwrap_or(std::cmp::Ordering::Equal));
            audio_clips.sort_by(|a, b| a.start_offset.partial_cmp(&b.start_offset).unwrap_or(std::cmp::Ordering::Equal));

            if video_clips.is_empty() && audio_clips.is_empty() {
                args.push("-f".to_string());
                args.push("lavfi".to_string());
                args.push("-i".to_string());
                args.push(format!("testsrc=duration=5:size={}x{}:rate={}", config.width, config.height, config.fps));
            } else {
                for clip in &video_clips {
                    args.push("-ss".to_string());
                    args.push(format!("{:.3}", clip.source_in));
                    args.push("-t".to_string());
                    args.push(format!("{:.3}", clip.duration));
                    args.push("-i".to_string());
                    args.push(clip.asset_path.clone());
                }

                for clip in &audio_clips {
                    args.push("-ss".to_string());
                    args.push(format!("{:.3}", clip.source_in));
                    args.push("-t".to_string());
                    args.push(format!("{:.3}", clip.duration));
                    args.push("-i".to_string());
                    args.push(clip.asset_path.clone());
                }

                let num_videos = video_clips.len();
                let num_audios = audio_clips.len();
                let mut filter_parts: Vec<String> = Vec::new();

                if num_videos > 0 {
                    if num_videos == 1 {
                        filter_parts.push(format!(
                            "[0:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,fps={},setsar=1[vout]",
                            config.width, config.height, config.width, config.height, config.fps
                        ));
                    } else {
                        for i in 0..num_videos {
                            filter_parts.push(format!(
                                "[{}:v]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,fps={},setsar=1[v{}]",
                                i, config.width, config.height, config.width, config.height, config.fps, i
                            ));
                        }
                        let concat_inputs: String = (0..num_videos).map(|i| format!("[v{}]", i)).collect();
                        filter_parts.push(format!("{}concat=n={}:v=1:a=0[vout]", concat_inputs, num_videos));
                    }
                }

                if num_audios > 0 {
                    audio_in_complex_filter = true;
                    let loudnorm_str = if let Some(target_lufs) = config.target_lufs {
                        format!(",loudnorm=I={:.1}:TP=-1.5:LRA=11", target_lufs)
                    } else {
                        "".to_string()
                    };

                    if num_audios == 1 {
                        let in_idx = num_videos;
                        filter_parts.push(format!(
                            "[{}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo{}[aout]",
                            in_idx, loudnorm_str
                        ));
                    } else {
                        for j in 0..num_audios {
                            let in_idx = num_videos + j;
                            filter_parts.push(format!(
                                "[{}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a{}]",
                                in_idx, j
                            ));
                        }
                        let concat_audio_inputs: String = (0..num_audios).map(|j| format!("[a{}]", j)).collect();
                        filter_parts.push(format!("{}concat=n={}:v=0:a=1{}[aout]", concat_audio_inputs, num_audios, loudnorm_str));
                    }
                }

                if !filter_parts.is_empty() {
                    args.push("-filter_complex".to_string());
                    args.push(filter_parts.join(";"));
                }

                if num_videos > 0 {
                    args.push("-map".to_string());
                    args.push("[vout]".to_string());
                }

                if num_audios > 0 {
                    args.push("-map".to_string());
                    args.push("[aout]".to_string());
                } else if num_videos > 0 {
                    args.push("-map".to_string());
                    args.push("0:a?".to_string());
                }
            }
        } else {
            args.push("-f".to_string());
            args.push("lavfi".to_string());
            args.push("-i".to_string());
            args.push(format!("testsrc=duration=5:size={}x{}:rate={}", config.width, config.height, config.fps));
        }

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

        // Audio normalization (Roadmap R18.2) - apply via -af only if not already normalized in filter_complex
        if !audio_in_complex_filter {
            if let Some(target_lufs) = config.target_lufs {
                args.push("-af".to_string());
                args.push(format!("loudnorm=I={:.1}:TP=-1.5:LRA=11", target_lufs));
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

    /// Probes available hardware encoders by running `ffmpeg -encoders`
    pub fn get_available_encoders() -> Vec<String> {
        let mut encoders = vec!["Software x264".to_string()];

        let output = match {
            #[cfg(target_os = "windows")]
            let cmd = {
                #[allow(unused_imports)]
                use std::os::windows::process::CommandExt;
                let mut c = std::process::Command::new("ffmpeg");
                c.creation_flags(CREATE_NO_WINDOW).arg("-encoders").output()
            };
            #[cfg(not(target_os = "windows"))]
            let cmd = std::process::Command::new("ffmpeg").arg("-encoders").output();
            cmd
        } {
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
        let total_duration = if let Some(ref clips) = config.clips {
            if !clips.is_empty() {
                clips.iter().map(|c| c.start_offset + c.duration).fold(0.0, f64::max)
            } else {
                5.0
            }
        } else {
            5.0
        };
        let total_frames = (config.fps * (if total_duration > 0.0 { total_duration } else { 5.0 })).round().max(1.0);

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
            let mut child = match {
                let mut cmd = Command::new(&cmd_spec.binary);
                cmd.args(&cmd_spec.args)
                   .stderr(Stdio::piped())
                   .stdout(Stdio::null());
                #[cfg(target_os = "windows")]
                {
                    #[allow(unused_imports)]
                    use std::os::windows::process::CommandExt;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }
                cmd.spawn()
            } {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_ffmpeg_command_fallback_testsrc() {
        let config = ExportTaskConfig {
            preset_name: "Test YouTube".to_string(),
            width: 1920,
            height: 1080,
            fps: 30.0,
            bitrate_mbps: 10,
            encoder: "Software x264".to_string(),
            output_path: "/tmp/out.mp4".to_string(),
            target_lufs: Some(-14.0),
            color_space: Some("bt709".to_string()),
            clips: None,
        };

        let spec = HardwareExportNative::build_ffmpeg_command(&config);
        assert!(spec.args.contains(&"testsrc=duration=5:size=1920x1080:rate=30".to_string()));
        assert!(spec.args.contains(&"loudnorm=I=-14.0:TP=-1.5:LRA=11".to_string()));
        assert!(spec.args.contains(&"libx264".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_command_with_timeline_clips() {
        let config = ExportTaskConfig {
            preset_name: "TikTok 9:16".to_string(),
            width: 1080,
            height: 1920,
            fps: 60.0,
            bitrate_mbps: 15,
            encoder: "NVENC (NVIDIA)".to_string(),
            output_path: "/tmp/tiktok.mp4".to_string(),
            target_lufs: Some(-14.0),
            color_space: Some("bt709".to_string()),
            clips: Some(vec![
                TimelineClipExport {
                    asset_path: "/media/video1.mp4".to_string(),
                    source_in: 2.0,
                    duration: 4.5,
                    start_offset: 0.0,
                    is_audio: false,
                },
                TimelineClipExport {
                    asset_path: "/media/video2.mp4".to_string(),
                    source_in: 0.0,
                    duration: 5.0,
                    start_offset: 4.5,
                    is_audio: false,
                },
                TimelineClipExport {
                    asset_path: "/media/music.wav".to_string(),
                    source_in: 1.0,
                    duration: 9.5,
                    start_offset: 0.0,
                    is_audio: true,
                },
            ]),
        };

        let spec = HardwareExportNative::build_ffmpeg_command(&config);

        // Verify inputs
        assert!(spec.args.contains(&"/media/video1.mp4".to_string()));
        assert!(spec.args.contains(&"/media/video2.mp4".to_string()));
        assert!(spec.args.contains(&"/media/music.wav".to_string()));

        // Verify filter complex was generated
        assert!(spec.args.contains(&"-filter_complex".to_string()));
        let filter_idx = spec.args.iter().position(|a| a == "-filter_complex").unwrap();
        let filter_graph = &spec.args[filter_idx + 1];

        // Should scale and pad to 1080x1920
        assert!(filter_graph.contains("scale=1080:1920"));
        assert!(filter_graph.contains("pad=1080:1920"));
        // Should concat 2 video inputs
        assert!(filter_graph.contains("concat=n=2:v=1:a=0[vout]"));
        // Should format and loudnorm the audio
        assert!(filter_graph.contains("loudnorm=I=-14.0:TP=-1.5:LRA=11[aout]"));

        // Verify mappings
        assert!(spec.args.contains(&"[vout]".to_string()));
        assert!(spec.args.contains(&"[aout]".to_string()));
        assert!(spec.args.contains(&"h264_nvenc".to_string()));
    }
}

