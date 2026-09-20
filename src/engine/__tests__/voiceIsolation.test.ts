import { describe, it, expect } from 'vitest';
import { voiceIsolationEngine } from '../voiceIsolation';

describe('VoiceIsolationEngine (R17.3)', () => {
  it('instantiates and provides mathematical spectral subtraction and dialogue leveling', () => {
    expect(voiceIsolationEngine).toBeDefined();
    expect(typeof voiceIsolationEngine.spectralSubtraction).toBe('function');
    expect(typeof voiceIsolationEngine.applyDialogueLeveler).toBe('function');
    expect(typeof voiceIsolationEngine.process).toBe('function');
  });

  it('measured SNR improvement on a noisy speech fixture exceeds 12dB', () => {
    const sampleRate = 48000;
    const durationSec = 2.0;
    const totalSamples = Math.floor(sampleRate * durationSec);
    const fixturePcm = new Float32Array(totalSamples);

    // Generate speech signal (harmonics of 250Hz voice pitch with envelope modulation)
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      // Speech active in bursts: 0.2s - 0.8s, 1.2s - 1.8s
      const isSpeechActive = (t >= 0.2 && t <= 0.8) || (t >= 1.2 && t <= 1.8);
      let speechSample = 0;
      if (isSpeechActive) {
        speechSample =
          0.4 * Math.sin(2 * Math.PI * 250 * t) +
          0.2 * Math.sin(2 * Math.PI * 500 * t) +
          0.1 * Math.sin(2 * Math.PI * 1000 * t);
      }

      // Add continuous background ambient noise (e.g. AC / fan hiss)
      // High noise floor: amplitude 0.08
      const noiseSample = (Math.random() * 2 - 1) * 0.08;

      fixturePcm[i] = speechSample + noiseSample;
    }

    const result = voiceIsolationEngine.process(fixturePcm, {
      strength: 0.85,
      enableLeveler: true,
      sampleRate,
    });

    expect(result.cleanedPcm.length).toBe(totalSamples);
    expect(result.snrImprovementDb).toBeGreaterThanOrEqual(12.0);
    console.log(`[Test] Measured Voice Isolation SNR Improvement: +${result.snrImprovementDb.toFixed(2)} dB`);
  });

  it('dialogue leveler normalizes quiet speech toward target broadcast level', () => {
    const sampleRate = 48000;
    const totalSamples = 48000; // 1s
    const quietSpeech = new Float32Array(totalSamples);

    // Low level speech: amplitude ~0.02 (-34 dBFS)
    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      quietSpeech[i] = 0.02 * Math.sin(2 * Math.PI * 300 * t);
    }

    const leveled = voiceIsolationEngine.applyDialogueLeveler(quietSpeech, {
      targetRmsDb: -20.0,
      maxGainDb: 12.0,
      sampleRate,
    });

    // Check RMS before vs after
    let sumQuiet = 0;
    let sumLeveled = 0;
    for (let i = 24000; i < totalSamples; i++) { // steady state
      sumQuiet += quietSpeech[i] * quietSpeech[i];
      sumLeveled += leveled[i] * leveled[i];
    }
    const rmsQuiet = Math.sqrt(sumQuiet / 24000);
    const rmsLeveled = Math.sqrt(sumLeveled / 24000);

    // Leveled signal should have boosted the quiet signal significantly
    expect(rmsLeveled).toBeGreaterThan(rmsQuiet * 2.0);
  });

  it('handles edge cases gracefully: empty buffers and silence', () => {
    const emptyPcm = new Float32Array(0);
    const emptyResult = voiceIsolationEngine.process(emptyPcm);
    expect(emptyResult.cleanedPcm.length).toBe(0);

    const silencePcm = new Float32Array(1024);
    const silenceResult = voiceIsolationEngine.process(silencePcm);
    expect(silenceResult.cleanedPcm.length).toBe(1024);
    expect(silenceResult.snrImprovementDb).toBeGreaterThanOrEqual(12.0);
  });
});
