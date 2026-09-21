use serde::{Deserialize, Serialize};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};
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
    /// Executes offline Whisper speech-to-text model on input audio waveform.
    ///
    /// SAFETY NOTE: whisper.cpp is compiled against a MinGW C++ runtime while the
    /// Tauri binary uses MSVC. C++ exceptions from whisper.cpp cannot unwind through
    /// the MSVC SEH frame table — attempting to do so produces STATUS_BAD_FUNCTION_TABLE
    /// (0xc00000ff) and kills the process. We therefore:
    ///   1. Catch any Rust panics via catch_unwind (does NOT catch C++ exceptions, but
    ///      catches Rust panics that may propagate from FFI error handling).
    ///   2. Validate all inputs before calling any FFI so the happy path never throws.
    pub fn transcribe_audio(audio_path: &str) -> Result<WhisperTranscriptNative, String> {
        // Run inside catch_unwind to turn any Rust panics into an Err
        // and prevent the Tauri process from aborting.
        let audio_path_owned = audio_path.to_string();
        let result = std::panic::catch_unwind(move || {
            Self::transcribe_audio_inner(&audio_path_owned)
        });

        match result {
            Ok(inner) => inner,
            Err(panic_val) => {
                let msg = if let Some(s) = panic_val.downcast_ref::<&str>() {
                    (*s).to_string()
                } else if let Some(s) = panic_val.downcast_ref::<String>() {
                    s.clone()
                } else {
                    "unknown panic in whisper FFI".to_string()
                };
                Err(format!("whisper transcription panicked: {}", msg))
            }
        }
    }

    fn transcribe_audio_inner(audio_path: &str) -> Result<WhisperTranscriptNative, String> {
        println!("[Whisper Native ONNX]: Transcribing audio file {}", audio_path);

        #[cfg(windows)]
        unsafe {
            extern "C" {
                fn _controlfp(new_val: u32, mask: u32) -> u32;
            }
            _controlfp(0x0008001F, 0x0008001F);
        }

        let candidate_paths = [
            std::path::PathBuf::from("ggml-tiny.en.bin"),
            std::path::PathBuf::from("src-tauri/ggml-tiny.en.bin"),
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.join("ggml-tiny.en.bin")))
                .unwrap_or_else(|| std::path::PathBuf::from("ggml-tiny.en.bin")),
        ];

        let model_path = candidate_paths
            .into_iter()
            .find(|p| p.exists())
            .ok_or_else(|| {
                "Model file ggml-tiny.en.bin not found. Download from https://huggingface.co/ggerganov/whisper.cpp".to_string()
            })?;

        let model_path_str = model_path.to_str().ok_or("Invalid model path string")?;
        println!("[Whisper]: Loading model from {}", model_path_str);

        let ctx_params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(model_path_str, ctx_params)
            .map_err(|e| format!("failed to load model: {}", e))?;

        let mut state = ctx.create_state().map_err(|e| format!("failed to create state: {}", e))?;

        let conformed_audio = crate::audio_conformance::ensure_16k_mono_wav(audio_path)?;
        let mut reader = WavReader::open(&conformed_audio.path).map_err(|e| format!("failed to open wav: {}", e))?;
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
            let word_duration = if !segment_words.is_empty() { duration / segment_words.len() as f64 } else { 0.0 };

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
