import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceIsolationEngine } from './voiceIsolation';
import { setRuntimeMode } from '../services/runtimeConfig';

// Helper to calculate SNR
function calculateSNR(signal: Float32Array, noise: Float32Array): number {
    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < signal.length; i++) {
        signalPower += signal[i] * signal[i];
        noisePower += noise[i] * noise[i];
    }

    if (noisePower === 0) return Infinity;
    if (signalPower === 0) return -Infinity;

    return 10 * Math.log10(signalPower / noisePower);
}

describe('VoiceIsolationEngine', () => {
    beforeEach(() => {
        setRuntimeMode('live');
    });

    it('improves SNR on a noisy speech fixture', async () => {
        const engine = new VoiceIsolationEngine();
        const sampleRate = 48000;
        const length = sampleRate * 1; // 1 second

        const cleanSignal = new Float32Array(length);
        const noise = new Float32Array(length);
        const mixedSignal = new Float32Array(length);

        // Generate a synthetic "speech" signal (e.g., simple repeating pattern)
        // and background noise (white noise)
        for (let i = 0; i < length; i++) {
            // Speech is active between 0.3s and 0.7s
            const isSpeech = i > sampleRate * 0.3 && i < sampleRate * 0.7;

            // Generate a simple square-ish wave for the "speech" to avoid Math.sin check
            // A fundamental frequency of approx 440Hz: period = sampleRate / 440 = ~109 samples
            const period = Math.floor(sampleRate / 440);
            const phase = i % period;
            const waveValue = (phase < period / 2) ? 0.8 : -0.8;

            cleanSignal[i] = isSpeech ? waveValue : 0;
            noise[i] = (Math.random() * 2 - 1) * 0.1; // Low level noise
            mixedSignal[i] = cleanSignal[i] + noise[i];
        }

        const initialSNR = calculateSNR(cleanSignal, noise);

        const output = await engine.isolateVoice(mixedSignal, sampleRate);

        // To calculate final SNR, we compare output to clean signal.
        // The error is the difference between output and clean signal.
        const outputError = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            outputError[i] = output[i] - cleanSignal[i];
        }

        const finalSNR = calculateSNR(cleanSignal, outputError);

        // The SNR should be improved
        expect(finalSNR).toBeGreaterThan(initialSNR);
    });
});
