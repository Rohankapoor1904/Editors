---
name: audio-dsp-engine
description: >-
  Audio DSP and WebAudio sub-frame graph architecture for CineCraft AI.
  Use when implementing the audio master clock, micro-crossfades on cut seams,
  ITU-R BS.1770-4 LUFS loudness metering, parametric EQ, and sidechain ducking.
---

# Audio DSP Engine & Master Clock Architecture

This skill governs the precision digital signal processing (DSP), sub-frame audio scheduling, and loudness normalization in CineCraft AI.

## 1. Audio as the Master Clock (Invariant 4)

1. **The Drift Problem**:
   - Variable Frame Rate (VFR) media and display refresh jitter cause video frame clocks to drift over time.
   - Accumulating video frames will inevitably cause lip-sync skew.

2. **The Invariant**:
   - The hardware audio DMA clock (`AudioContext.currentTime` / PCM sample counter at 48,000 Hz) is the ONLY master clock.
   - The video transport evaluates current playback position from the audio DMA sample counter:
     ```typescript
     const masterSeconds = audioContext.currentTime - playbackStartTime;
     const currentFrame = rationalTimeFromSeconds(masterSeconds, sequenceFps);
     ```
   - Video frames are dropped or duplicated to stay strictly locked within 1 audio frame (< 20ms offset).

## 2. Micro-Crossfades on Cut Seams (R6.4)

- **The Click Phenomenon**: Slicing audio waveforms at non-zero-crossings creates an instantaneous DC step that produces an audible high-frequency "click" or "pop".
- **The Solution**:
  - Automatically apply a 10ms equal-power crossfade (`cos`/`sin` curve) across every edit boundary:
    ```typescript
    // Gain fading out on leaving clip
    gainNodeA.gain.setValueCurveAtTime(fadeArrayOut, cutTime - 0.005, 0.010);
    // Gain fading in on entering clip
    gainNodeB.gain.setValueCurveAtTime(fadeArrayIn, cutTime - 0.005, 0.010);
    ```

## 3. ITU-R BS.1770-4 LUFS Metering (R5.3)

1. **K-Weighting Pre-Filter**:
   - **Stage 1 (Head Acoustic Simulation)**: High-shelf filter (+4.0 dB boost at 1.5 kHz).
   - **Stage 2 (RLB High-Pass Filter)**: 2nd-order Butterworth high-pass with cutoff at 38 Hz.
2. **Dual-Gating Algorithm**:
   - **Absolute Gating**: Discard all 400ms blocks where power < -70 LKFS.
   - **Relative Gating**: Calculate mean of remaining blocks; discard blocks falling > 10 LU below that mean.
   - Compute integrated LUFS over remaining blocks.
3. **Targets**:
   - YouTube / Spotify: `-14 LUFS` (±1 LUFS).
   - Broadcast (EBU R128 / ATSC A/85): `-23 LUFS` / `-24 LUFS`.

## 4. Multi-Track Bus Routing & Sidechain Ducking

- **Track Channels**: Each timeline audio track routes into its own `GainNode`, `StereoPannerNode`, and 10-band `BiquadFilterNode` EQ chain.
- **Sidechain Ducking**:
  - Voice/Dialogue tracks feed an envelope follower analyzer.
  - When dialogue level exceeds threshold (-28 dBFS), dynamically compress/duck the Music bus gain by -6 dB to -12 dB with a 50ms attack and 300ms release.
