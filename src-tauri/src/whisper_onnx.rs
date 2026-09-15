use serde::{Deserialize, Serialize};

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
    /// Executes offline Whisper ONNX speech-to-text model on input audio waveform
    pub fn transcribe_audio(audio_path: &str) -> Result<WhisperTranscriptNative, String> {
        println!("[Whisper Native ONNX]: Transcribing audio file {}", audio_path);

        // INVARIANT §5.5: Fail loudly rather than returning silent mock data on main path
        Err(format!(
            "Native Whisper ONNX STT engine requires model weights and ONNX runtime integration (see Roadmap R6.1). File: {}",
            audio_path
        ))
    }
}
