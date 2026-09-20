import { RationalTime, secondsToRational } from '../../types/time';

export interface MultiCamAngleProfile {
  angleIndex: number;
  name: string;
  assetId: string;
  audioSignal: Float32Array;
}

export interface MultiCamCutDecision {
  timestampSeconds: number;
  timestampRational: RationalTime;
  angleIndex: number;
  assetId: string;
  angleName: string;
  reason: 'speaker_active' | 'speaker_change' | 'wide_pause' | 'simultaneous_speech';
}

export interface AutoSwitchOptions {
  minShotDurationSec?: number; // Minimum length of a shot to avoid hyperactive cutting (default 2.0s)
  speechThresholdDb?: number;  // Threshold in dB to consider speech active (default -28 dB)
  wideAngleIndex?: number;     // Index of wide/group shot (default 0)
  sampleRate?: number;         // Audio sample rate in Hz (default 48000)
}

/**
 * AI Active Speaker Auto-Switching Engine (Task R20.3)
 *
 * Automatically generates editorial cut decisions across synchronized camera angles
 * based on speech energy analysis, dialogue turn detection, and pacing rules.
 */
export class MultiCamAutoSwitchEngine {
  /**
   * Generates automated camera angle cut points across sequence duration
   */
  generateAutoCuts(
    angles: MultiCamAngleProfile[],
    durationSec: number,
    options: AutoSwitchOptions = {}
  ): MultiCamCutDecision[] {
    if (angles.length === 0 || durationSec <= 0) {
      return [];
    }

    if (angles.length === 1) {
      return [
        {
          timestampSeconds: 0,
          timestampRational: secondsToRational(0),
          angleIndex: angles[0].angleIndex,
          assetId: angles[0].assetId,
          angleName: angles[0].name,
          reason: 'speaker_active',
        },
      ];
    }

    const minShotDuration = options.minShotDurationSec ?? 2.0;
    const thresholdDb = options.speechThresholdDb ?? -28.0;
    const wideIdx = options.wideAngleIndex !== undefined ? options.wideAngleIndex : 0;
    const sampleRate = options.sampleRate ?? 48000;

    const stepSec = 0.2;
    const windowSamples = Math.floor(sampleRate * stepSec);

    const measureEnergiesAt = (sampleOffset: number) => {
      const energies: { angle: MultiCamAngleProfile; db: number }[] = [];
      for (const angle of angles) {
        if (!angle.audioSignal || angle.audioSignal.length === 0) {
          energies.push({ angle, db: -100 });
          continue;
        }

        let sumSq = 0;
        let count = 0;
        for (let j = 0; j < windowSamples && sampleOffset + j < angle.audioSignal.length; j++) {
          const val = angle.audioSignal[sampleOffset + j] || 0;
          sumSq += val * val;
          count++;
        }

        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        const db = 20 * Math.log10(rms + 1e-6);
        energies.push({ angle, db });
      }
      return energies.sort((a, b) => b.db - a.db);
    };

    // Determine initial angle and reason at t=0
    const initialEnergies = measureEnergiesAt(0);
    const topInitial = initialEnergies[0];
    const runnerUpInitial = initialEnergies[1];

    let currentAngle = angles[wideIdx] || angles[0];
    let initialReason: MultiCamCutDecision['reason'] = 'speaker_active';

    if (topInitial && topInitial.db >= thresholdDb) {
      if (runnerUpInitial && topInitial.db - runnerUpInitial.db < 3.0) {
        // Both speakers active simultaneously -> start on wide shot
        currentAngle = angles[wideIdx] || angles[0];
        initialReason = 'simultaneous_speech';
      } else {
        // Clear active speaker at start
        currentAngle = topInitial.angle;
        initialReason = 'speaker_active';
      }
    }

    const cuts: MultiCamCutDecision[] = [];

    cuts.push({
      timestampSeconds: 0,
      timestampRational: secondsToRational(0),
      angleIndex: currentAngle.angleIndex,
      assetId: currentAngle.assetId,
      angleName: currentAngle.name,
      reason: initialReason,
    });

    let lastCutTime = 0;

    for (let t = stepSec; t < durationSec; t += stepSec) {
      const sampleOffset = Math.floor(t * sampleRate);
      const angleEnergies = measureEnergiesAt(sampleOffset);

      const topAngle = angleEnergies[0];
      const runnerUp = angleEnergies[1];

      let targetAngle = currentAngle;
      let reason: MultiCamCutDecision['reason'] = 'speaker_active';

      // Check if speakers are speaking simultaneously
      if (topAngle.db >= thresholdDb && runnerUp && topAngle.db - runnerUp.db < 3.0) {
        // Both speakers talking -> cut to wide angle
        targetAngle = angles[wideIdx] || angles[0];
        reason = 'simultaneous_speech';
      } else if (topAngle.db >= thresholdDb) {
        // Clear active speaker
        targetAngle = topAngle.angle;
        reason = targetAngle.angleIndex === currentAngle.angleIndex ? 'speaker_active' : 'speaker_change';
      } else {
        // Pause / silence -> cut to wide shot if silence persists
        if (t - lastCutTime > minShotDuration * 1.5) {
          targetAngle = angles[wideIdx] || angles[0];
          reason = 'wide_pause';
        }
      }

      // Apply minimum shot duration rule
      if (targetAngle.angleIndex !== currentAngle.angleIndex && t - lastCutTime >= minShotDuration) {
        currentAngle = targetAngle;
        lastCutTime = t;

        cuts.push({
          timestampSeconds: t,
          timestampRational: secondsToRational(t),
          angleIndex: currentAngle.angleIndex,
          assetId: currentAngle.assetId,
          angleName: currentAngle.name,
          reason,
        });
      }
    }

    return cuts;
  }
}

export const multiCamAutoSwitchEngine = new MultiCamAutoSwitchEngine();
