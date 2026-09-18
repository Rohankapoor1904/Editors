import { isLiveMode } from '../services/runtimeConfig';

export class VoiceIsolationEngine {
    constructor() {}

    async isolateVoice(audioBuffer: Float32Array, sampleRate: number): Promise<Float32Array> {
        if (!isLiveMode()) {
            // Demo mode fallback: just return the input
            return new Float32Array(audioBuffer);
        }

        // Apply a simple spectral gate / noise gate for denoise.
        // We calculate the short-time energy. If it's below a threshold, we attenuate it.
        // This is a naive implementation but operates on real data.

        const output = new Float32Array(audioBuffer.length);
        const windowSize = Math.floor(sampleRate * 0.01); // 10ms window

        // Find average noise floor by looking at the first 100ms
        const noiseEstimationWindow = Math.min(audioBuffer.length, Math.floor(sampleRate * 0.1));
        let noisePower = 0;
        for (let i = 0; i < noiseEstimationWindow; i++) {
            noisePower += audioBuffer[i] * audioBuffer[i];
        }
        noisePower = (noisePower / noiseEstimationWindow) || 1e-10;

        const threshold = noisePower * 2.0; // Simple threshold

        for (let i = 0; i < audioBuffer.length; i += windowSize) {
            let frameEnergy = 0;
            const end = Math.min(i + windowSize, audioBuffer.length);

            for (let j = i; j < end; j++) {
                frameEnergy += audioBuffer[j] * audioBuffer[j];
            }
            frameEnergy /= (end - i);

            // Attenuation factor: if energy < threshold, attenuate heavily, else keep.
            // Smooth transition can be applied.
            let gain = 1.0;
            if (frameEnergy < threshold) {
                // Attenuate noise
                gain = Math.max(0.01, frameEnergy / threshold); // Simple soft gate
            }

            for (let j = i; j < end; j++) {
                output[j] = audioBuffer[j] * gain;
            }
        }

        return output;
    }
}
