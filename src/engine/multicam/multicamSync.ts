import { RationalTime, secondsToRational } from '../../types/time';

export interface MultiCamSyncResult {
  offsetSeconds: number;
  offsetRational: RationalTime;
  confidence: number; // Normalized cross-correlation peak in [0, 1]
}

/**
 * Multi-Camera Audio Waveform Cross-Correlation Synchronizer (Task R20.1)
 *
 * Aligns secondary camera audio tracks to a reference master track by
 * computing normalized cross-correlation across audio envelope/energy signals.
 */
export class MultiCamSyncEngine {
  /**
   * Computes downsampled RMS energy envelope for fast, robust cross-correlation
   */
  private computeEnergyEnvelope(signal: Float32Array, windowSize: number, hopSize: number): Float32Array {
    const numFrames = Math.max(1, Math.floor((signal.length - windowSize) / hopSize) + 1);
    const envelope = new Float32Array(numFrames);

    for (let i = 0; i < numFrames; i++) {
      const start = i * hopSize;
      let sumSq = 0;
      for (let j = 0; j < windowSize; j++) {
        const val = signal[start + j] || 0;
        sumSq += val * val;
      }
      envelope[i] = Math.sqrt(sumSq / windowSize);
    }

    // Zero-mean normalization
    let mean = 0;
    for (let i = 0; i < numFrames; i++) mean += envelope[i];
    mean /= numFrames;

    let variance = 0;
    for (let i = 0; i < numFrames; i++) {
      envelope[i] -= mean;
      variance += envelope[i] * envelope[i];
    }

    const stdDev = Math.sqrt(variance / numFrames);
    if (stdDev > 1e-4) {
      for (let i = 0; i < numFrames; i++) {
        envelope[i] /= stdDev;
      }
    } else {
      for (let i = 0; i < numFrames; i++) {
        envelope[i] = 0;
      }
    }

    return envelope;
  }

  /**
   * Aligns two audio signals and finds the time offset (in seconds) of targetSignal relative to refSignal.
   * A positive offset means targetSignal started later than refSignal.
   *
   * @param refSignal Reference master camera audio PCM (Float32Array)
   * @param targetSignal Secondary camera angle audio PCM (Float32Array)
   * @param sampleRate Sample rate in Hz (default 48000)
   * @param maxDelaySec Maximum expected search window in seconds (default 10s)
   */
  syncAudioWaveforms(
    refSignal: Float32Array,
    targetSignal: Float32Array,
    sampleRate: number = 48000,
    maxDelaySec: number = 10
  ): MultiCamSyncResult {
    if (refSignal.length === 0 || targetSignal.length === 0) {
      return {
        offsetSeconds: 0,
        offsetRational: secondsToRational(0),
        confidence: 0,
      };
    }

    // Use 20ms window and 5ms hop size (200 Hz envelope sampling)
    const windowSize = Math.max(64, Math.floor(sampleRate * 0.02));
    const hopSize = Math.max(16, Math.floor(sampleRate * 0.005));
    const envelopeFps = sampleRate / hopSize;

    const envRef = this.computeEnergyEnvelope(refSignal, windowSize, hopSize);
    const envTarget = this.computeEnergyEnvelope(targetSignal, windowSize, hopSize);

    const maxLagFrames = Math.min(
      Math.floor(maxDelaySec * envelopeFps),
      Math.floor(Math.min(envRef.length, envTarget.length) / 2)
    );

    let maxCorr = -Infinity;
    let bestLag = 0;

    // Cross-correlation: R(lag) = sum_t (ref[t] * target[t + lag]) / sqrt(sum ref[t]^2 * sum target[t + lag]^2)
    // Positive lag means target is delayed relative to ref.
    for (let lag = -maxLagFrames; lag <= maxLagFrames; lag++) {
      let sum = 0;
      let sumSqRef = 0;
      let sumSqTarget = 0;

      const tStart = Math.max(0, -lag);
      const tEnd = Math.min(envRef.length, envTarget.length - lag);

      for (let t = tStart; t < tEnd; t++) {
        const r = envRef[t];
        const tg = envTarget[t + lag];
        sum += r * tg;
        sumSqRef += r * r;
        sumSqTarget += tg * tg;
      }

      const denom = Math.sqrt(sumSqRef * sumSqTarget);
      if (denom > 1e-6) {
        const normCorr = sum / denom;
        if (normCorr > maxCorr) {
          maxCorr = normCorr;
          bestLag = lag;
        }
      }
    }

    const offsetSeconds = maxCorr > 0 ? bestLag / envelopeFps : 0;
    const confidence = maxCorr > 0 ? Math.max(0, Math.min(1.0, maxCorr)) : 0;

    return {
      offsetSeconds,
      offsetRational: secondsToRational(offsetSeconds, 60000),
      confidence,
    };
  }
}

export const multicamSyncEngine = new MultiCamSyncEngine();
