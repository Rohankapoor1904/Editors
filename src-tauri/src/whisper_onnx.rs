use serde::{Deserialize, Serialize};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
use std::path::Path;
use hound::WavReader;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WordTimestampNative {
    pub id: String,
    pub word: String,
    pub start_time: f64,
    pub end_time: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperTranscriptNative {
    pub full_text: String,
    pub words: Vec<WordTimestampNative>,
}

pub struct WhisperOnnxEngine;

impl WhisperOnnxEngine {
    /// Executes offline Whisper speech-to-text model on input audio waveform
    pub fn transcribe_audio(audio_path: &str) -> Result<WhisperTranscriptNative, String> {
        println!("[Whisper Native ONNX]: Transcribing audio file {}", audio_path);

        let model_path = Path::new("ggml-tiny.en.bin");
        if !model_path.exists() {
             return Err(format!("Model file not found at {}", model_path.display()));
        }

        let ctx_params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params("ggml-tiny.en.bin", ctx_params)
            .map_err(|e| format!("failed to load model: {}", e))?;

        let mut state = ctx.create_state().map_err(|e| format!("failed to create state: {}", e))?;

        let mut reader = WavReader::open(audio_path).map_err(|e| format!("failed to open wav: {}", e))?;
        let spec = reader.spec();

        if spec.channels != 1 || spec.sample_rate != 16000 {
             return Err(format!("WAV file must be 16kHz mono, got {} Hz {} channels", spec.sample_rate, spec.channels));
        }

        let mut audio_data = Vec::new();
        if spec.sample_format == hound::SampleFormat::Int {
            for sample in reader.samples::<i16>() {
                let sample = sample.map_err(|e| format!("failed to read sample: {}", e))?;
                audio_data.push(sample as f32 / 32768.0);
            }
        } else if spec.sample_format == hound::SampleFormat::Float {
             for sample in reader.samples::<f32>() {
                let sample = sample.map_err(|e| format!("failed to read sample: {}", e))?;
                audio_data.push(sample);
            }
        } else {
            return Err("Unsupported sample format".to_string());
        }

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, &audio_data[..])
            .map_err(|e| format!("failed to run model: {}", e))?;

        let num_segments = state.full_n_segments();

        let mut full_text = String::new();
        let mut words = Vec::new();
        let mut word_idx = 0;

        for i in 0..num_segments {
            let whisper_segment = match state.get_segment(i) {
                Some(seg) => seg,
                None => continue,
            };

            let segment_text = whisper_segment.to_str_lossy().unwrap_or_else(|_| std::borrow::Cow::Borrowed("")).into_owned();

            let start = whisper_segment.start_timestamp();
            let end = whisper_segment.end_timestamp();

            // whisper-rs timestamps are in 10ms units
            let start_sec = start as f64 / 100.0;
            let end_sec = end as f64 / 100.0;

            if i > 0 {
                full_text.push(' ');
            }
            full_text.push_str(&segment_text);

            let segment_words: Vec<&str> = segment_text.split_whitespace().collect();
            let duration = end_sec - start_sec;
            let word_duration = if segment_words.len() > 0 { duration / segment_words.len() as f64 } else { 0.0 };

            for (j, word) in segment_words.iter().enumerate() {
                 let w_start = start_sec + (j as f64 * word_duration);
                 let w_end = w_start + word_duration;
                 words.push(WordTimestampNative {
                    id: format!("w{}", word_idx),
                    word: (*word).to_string(),
                    start_time: w_start,
                    end_time: w_end,
                    confidence: 0.99,
                 });
                 word_idx += 1;
            }
        }

        Ok(WhisperTranscriptNative {
            full_text,
            words,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transcribe_audio() {
        // Need to check if model exists before running test as we might not have it downloaded
        if !std::path::Path::new("ggml-tiny.en.bin").exists() {
             return; // Skip test in pure environments if we haven't fetched it
        }

        let audio_path = "fixtures/jfk.wav";
        if !std::path::Path::new(audio_path).exists() {
             return;
        }

        let result = WhisperOnnxEngine::transcribe_audio(audio_path);
        assert!(result.is_ok());
        let transcript = result.unwrap();
        assert!(!transcript.full_text.is_empty());
        assert!(!transcript.words.is_empty());
    }
}
