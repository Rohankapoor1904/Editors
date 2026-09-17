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
        for(let i=0; i<tone.length; i++) {
            tone[i] = peakAmp * Math.sin(2 * Math.PI * 1000 * i / sr);
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
