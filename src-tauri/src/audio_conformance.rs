use std::path::Path;
use hound::WavReader;
use crate::process_utils::silent_command;
use uuid::Uuid;

#[derive(Debug)]
pub struct ConformedAudio {
    pub path: String,
    pub is_temp: bool,
}

impl Drop for ConformedAudio {
    fn drop(&mut self) {
        if self.is_temp {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

pub fn ensure_16k_mono_wav(input_path: &str) -> Result<ConformedAudio, String> {
    let path = Path::new(input_path);
    if !path.exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    // Try opening as WAV directly
    if let Ok(reader) = WavReader::open(input_path) {
        let spec = reader.spec();
        if spec.channels == 1 && spec.sample_rate == 16000 && (spec.sample_format == hound::SampleFormat::Int || spec.sample_format == hound::SampleFormat::Float) {
            return Ok(ConformedAudio {
                path: input_path.to_string(),
                is_temp: false,
            });
        }
    }

    // Otherwise, extract and resample to 16kHz mono WAV using ffmpeg
    let temp_dir = std::env::temp_dir();
    let temp_wav_name = format!("cinecraft_conformed_{}.wav", Uuid::new_v4());
    let temp_wav_path = temp_dir.join(temp_wav_name).to_string_lossy().to_string();

    let output = silent_command("ffmpeg")
        .args(&[
            "-y",
            "-i",
            input_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            &temp_wav_path,
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffmpeg for audio conforming: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed to conform audio to 16kHz mono: {}", stderr));
    }

    Ok(ConformedAudio {
        path: temp_wav_path,
        is_temp: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ensure_16k_mono_wav_missing_file() {
        let res = ensure_16k_mono_wav("/non/existent/audio.wav");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Input file not found"));
    }
}
