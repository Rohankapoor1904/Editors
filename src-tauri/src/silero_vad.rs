use hound::WavReader;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::Value;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SilenceSegmentNative {
    pub start_time: f64,
    pub end_time: f64,
    pub duration: f64,
}

pub struct SileroVadEngine;

impl SileroVadEngine {
    /// Detects silent intervals across audio PCM frames using Silero VAD neural probabilities
    pub fn detect_silence(
        audio_path: &str,
        min_silence_dur_sec: f64,
        _threshold_db: f64,
    ) -> Result<Vec<SilenceSegmentNative>, String> {
        println!(
            "[Silero VAD Native Engine]: Processing audio file {} for silences > {}s",
            audio_path, min_silence_dur_sec
        );

        // For production, the model path should be resolved via Tauri PathResolver,
        // but for this task/test scope we use a direct relative path (matching Whisper integration).
        let model_path = "models/silero_vad.onnx";
        if !std::path::Path::new(model_path).exists() {
            // Check fallback for Tauri context vs rust test context
            let fallback_path = "../models/silero_vad.onnx";
            if !std::path::Path::new(fallback_path).exists() {
                return Err(format!("Silero VAD ONNX model not found. Checked {}, {}", model_path, fallback_path));
            }
        }

        let actual_model_path = if std::path::Path::new(model_path).exists() {
            model_path
        } else {
            "../models/silero_vad.onnx"
        };


        let mut session = Session::builder()
            .map_err(|e| format!("Failed to create ORT SessionBuilder: {}", e))?
            .with_optimization_level(GraphOptimizationLevel::Level1)
            .map_err(|e| format!("Failed to set ORT optimization level: {}", e))?
            .commit_from_file(actual_model_path)
            .map_err(|e| format!("Failed to load ORT session from file: {}", e))?;

        let conformed_audio = crate::audio_conformance::ensure_16k_mono_wav(audio_path)?;
        let mut reader = WavReader::open(&conformed_audio.path).map_err(|e| format!("Failed to open wav: {}", e))?;
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

        let batch_size = 1;
        let mut state = ndarray::Array3::<f32>::zeros((2, batch_size, 128));
        let sr = ndarray::Array1::<i64>::from_vec(vec![16000]);
        let sr_tensor = Value::from_array(sr).map_err(|e| format!("Failed to create sr tensor: {}", e))?;

        let window_size_samples = 512;
        let mut silences = Vec::new();
        let mut current_silence_start: Option<f64> = None;

        let mut i = 0;
        while i + window_size_samples <= audio_data.len() {
            let chunk = &audio_data[i..i+window_size_samples];
            let chunk_array = ndarray::Array2::<f32>::from_shape_vec((1, window_size_samples), chunk.to_vec())
                .map_err(|e| format!("Failed to create chunk array: {}", e))?;

            let chunk_tensor = Value::from_array(chunk_array).map_err(|e| format!("Failed to create chunk tensor: {}", e))?;
            let state_tensor = Value::from_array(state.clone()).map_err(|e| format!("Failed to create state tensor: {}", e))?;

            // In ort 2.0.0-rc.13, inputs! returns a Vec directly, not a Result
            let inputs = ort::inputs![
                "input" => chunk_tensor,
                "sr" => sr_tensor.clone(),
                "state" => state_tensor,
            ];

            let outputs = session.run(inputs).map_err(|e| format!("ORT execution failed: {}", e))?;

            let speech_prob_tensor = outputs["output"].try_extract_tensor::<f32>()
                .map_err(|e| format!("Failed to extract speech prob: {}", e))?;
            let (_, speech_prob_data) = speech_prob_tensor;
            let speech_prob = speech_prob_data.first().copied().unwrap_or(0.0);

            let new_state_tensor = outputs["stateN"].try_extract_tensor::<f32>()
                .map_err(|e| format!("Failed to extract stateN: {}", e))?;
            let (shape, new_state_data) = new_state_tensor;
            let shape_vec: Vec<usize> = shape.iter().map(|&x| x as usize).collect();
            let new_state_array = ndarray::ArrayView::from_shape(shape_vec, new_state_data)
                .map_err(|e| format!("Failed to reshape state: {}", e))?;
            state.assign(&new_state_array);

            let current_time = i as f64 / 16000.0;
            let is_silence = speech_prob < 0.5; // Prob threshold for VAD

            if is_silence {
                if current_silence_start.is_none() {
                    current_silence_start = Some(current_time);
                }
            } else {
                if let Some(start) = current_silence_start {
                    let end_time = current_time;
                    let duration = end_time - start;
                    if duration >= min_silence_dur_sec {
                        silences.push(SilenceSegmentNative {
                            start_time: start,
                            end_time: end_time,
                            duration,
                        });
                    }
                    current_silence_start = None;
                }
            }

            i += window_size_samples;
        }

        if let Some(start) = current_silence_start {
            let end_time = audio_data.len() as f64 / 16000.0;
            let duration = end_time - start;
            if duration >= min_silence_dur_sec {
                silences.push(SilenceSegmentNative {
                    start_time: start,
                    end_time: end_time,
                    duration,
                });
            }
        }

        Ok(silences)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vad() {
        if !std::path::Path::new("models/silero_vad.onnx").exists() && !std::path::Path::new("../models/silero_vad.onnx").exists() {
            return;
        }
        let audio_path = "fixtures/jfk.wav";
        if !std::path::Path::new(audio_path).exists() {
            return;
        }
        let res = SileroVadEngine::detect_silence(audio_path, 0.1, -35.0);
        assert!(res.is_ok());
    }
}
