---
name: ai-perception-ml
description: >-
  AI perception models and machine learning pipelines for CineCraft AI.
  Use when implementing Whisper speech-to-text, forced word alignment, Silero VAD silence trimming,
  SAM 2 video object tracking, and Kalman filter auto-reframe for 9:16 vertical video.
---

# AI Perception & Machine Learning Engine

This skill guides the implementation, optimization, and testing of deep learning models in CineCraft AI.

## 1. Whisper Speech-to-Text & Forced Alignment (R6.1, R6.2)

1. **Quantized Native Inference**:
   - Model: `ggml-tiny.en.bin` or ONNX int8 weights loaded via Rust ONNX Runtime (`ort`).
   - Generates transcribed tokens with start/end millisecond timestamps.

2. **Text-Based Rough Cut Editing**:
   - Every word in the transcript is bound to a `WordTimestamp { word, startMs, endMs }`.
   - Editorial Action: When a user selects and deletes words in the `TranscriptEditor`, the `AlignmentService` computes exact contiguous timeline ranges and applies a ripple delete across linked audio and video tracks:
     ```typescript
     const rippleDeleteRanges = alignmentService.computeRippleDeletes(deletedWordIndices);
     executeTransaction(new RippleDeleteCompoundCommand(rippleDeleteRanges));
     ```

## 2. Silero Voice Activity Detection (VAD) (R6.3)

- **Silence Window Extraction**:
  - Sample rate: 16,000 Hz mono PCM.
  - Speech threshold: 0.50 probability.
  - Minimum silence duration: 0.5 seconds.
- **Seam Padding (Prevent Word Truncation)**:
  - Add `150ms` lead-in padding (lookahead) before speech starts.
  - Add `250ms` tail-out padding (lookbehind) after speech ends.
  - Never cut directly on plosive consonants or decaying breath sounds.

## 3. SAM 2 Object Tracking & Auto-Reframe (R6.5, R6.6)

1. **SAM 2 Mask Tracking**:
   - User clicks an object or subject bounding box in the `ProgramMonitor`.
   - SAM 2 generates an initial segmentation mask and propagates mask embeddings forward across consecutive frames.
   - Outputs: Frame-indexed bounding boxes `[x, y, width, height]`.

2. **Kalman Filter Smoothing for 9:16 Reframe**:
   - Direct raw bounding box tracking creates jittery, nauseating camera pans.
   - Apply a 1D/2D Kalman filter with state vector `[position, velocity]` to smooth camera motion:
     ```typescript
     // Predict next position
     const predictedPos = kf.predict();
     // Update with current detected subject centroid
     const smoothedPos = kf.update(detectedCentroidX);
     ```
   - **Hard Boundary Constraint**: The smoothed crop window MUST clamp such that the subject bounding box is never clipped outside the viewport edges.
