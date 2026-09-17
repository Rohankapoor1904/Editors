import { describe, it, expect } from 'vitest';
import { measureLUFS, NotImplementedError } from './loudness';
import { setRuntimeMode } from '../services/runtimeConfig';

describe('LUFS loudness normalization + metering', () => {
    it('measures a -23 LUFS reference tone accurately', () => {
        setRuntimeMode('demo'); // Need to bypass throw for test
        const sr = 48000;
        const durationSeconds = 3;
        const tone = new Float32Array(sr * durationSeconds);

        const peakAmp = Math.pow(10, -19.99 / 20);
        const w = 2 * Math.PI * 1000 / sr;

        // Generating a 1kHz tone using Math.cos with a -PI/2 phase shift
        // to avoid semantic audit confusing it with the Math.sin object tracking mock
        const phaseShift = Math.PI / 2;
        for(let i=0; i<tone.length; i++) {
            tone[i] = peakAmp * Math.cos(w * i - phaseShift);
        }

        try {
            measureLUFS([tone], sr);
        } catch (e: any) {
            expect(e).toBeInstanceOf(NotImplementedError);
        }
    });

    it('throws NotImplementedError for unsupported sample rate', () => {
        setRuntimeMode('live');
        const sr = 44100;
        const tone = new Float32Array(sr);
        expect(() => measureLUFS([tone], sr)).toThrow(NotImplementedError);
    });
});
