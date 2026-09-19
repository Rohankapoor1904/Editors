import { describe, test, expect, beforeEach, vi } from 'vitest';
import { WebAudioEngineManager } from './audioEngine';
import { Clip } from '../types/timeline';

// Mock WebAudio API for tests
class MockGainNode {
    gain: any;
    connect = vi.fn();
    disconnect = vi.fn();
    constructor() {
        this.gain = {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
            setTargetAtTime: vi.fn()
        };
    }
}

class MockAudioContext {
    currentTime: number = 0;
    state: string = 'running';
    destination: any = {};
    createGain() { return new MockGainNode(); }
    createAnalyser() { return { getFloatTimeDomainData: vi.fn() }; }
    resume = vi.fn().mockResolvedValue(undefined);
    createBiquadFilter = vi.fn(() => ({
        type: '',
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect: vi.fn()
    }));
    createDynamicsCompressor = vi.fn(() => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect: vi.fn()
    }));
    createDelay = vi.fn(() => ({
        delayTime: { value: 0 },
        connect: vi.fn()
    }));
}

describe('WebAudioEngineManager R2.5', () => {
    let engine: WebAudioEngineManager;

    beforeEach(() => {
        globalThis.window = {
            AudioContext: MockAudioContext,
            setInterval: vi.fn(),
            clearInterval: vi.fn()
        } as any;
        engine = new WebAudioEngineManager();
        engine.init(48000);
        // Ensure timeline store mock returns empty for tests so it won't crash
        vi.mock('../store/timelineStore', () => ({
            useTimelineStore: {
                getState: () => ({ tracks: [] })
            }
        }));
    });

    test('gain of -6dB measurably halves amplitude', () => {
        const gainNode = engine.getOrCreateTrackGain('track1') as any;
        expect(gainNode).toBeDefined();

        engine.setTrackVolume('track1', -6.020599913279624); // Exactly 0.5 linear
        expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);

        engine.setTrackVolume('track1', 0);
        expect(gainNode.gain.setValueAtTime).toHaveBeenCalledWith(1, 0);

        // Also test clip gain
        const clipGain = engine.getOrCreateClipGain('clip1') as any;
        engine.setClipVolume('clip1', -6.020599913279624);
        expect(clipGain.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 0);
    });


    test('applyMicroCrossfade schedules a 10ms crossfade between adjacent clips', () => {
        const clip1: Clip = {
            id: 'c1', assetId: 'a1', name: 'clip1',
            startOffset: { value: 0, rate: 1 },
            sourceIn: { value: 0, rate: 1 },
            sourceOut: { value: 10, rate: 1 },
            duration: { value: 10, rate: 1 } // ends at 10
        };
        const clip2: Clip = {
            id: 'c2', assetId: 'a2', name: 'clip2',
            startOffset: { value: 10, rate: 1 }, // starts at 10
            sourceIn: { value: 0, rate: 1 },
            sourceOut: { value: 10, rate: 1 },
            duration: { value: 10, rate: 1 }
        };

        const gainNode1 = engine.getOrCreateClipGain(clip1.id) as any;
        const gainNode2 = engine.getOrCreateClipGain(clip2.id) as any;

        // Context anchor is 100s, playhead is at 0s
        engine.applyMicroCrossfade(clip1, clip2, 100, { value: 0, rate: 1 });

        // Seam is at 10s on timeline -> 110s in context
        // Left clip fades out from 109.995 to 110
        expect(gainNode1.gain.setValueAtTime).toHaveBeenCalledWith(1.0, 109.995);
        expect(gainNode1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 110);

        // Right clip fades in from 110 to 110.005
        expect(gainNode2.gain.setValueAtTime).toHaveBeenCalledWith(0, 110);
        expect(gainNode2.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 110.005);
    });

    test('overlapping clips crossfade without clicks', () => {
        const clip1: Clip = {
            id: 'c1', assetId: 'a1', name: 'clip1',
            startOffset: { value: 0, rate: 1 },
            sourceIn: { value: 0, rate: 1 },
            sourceOut: { value: 10, rate: 1 },
            duration: { value: 10, rate: 1 } // 0 to 10
        };
        const clip2: Clip = {
            id: 'c2', assetId: 'a2', name: 'clip2',
            startOffset: { value: 9, rate: 1 }, // overlaps at 9 to 10
            sourceIn: { value: 0, rate: 1 },
            sourceOut: { value: 10, rate: 1 },
            duration: { value: 10, rate: 1 }
        };

        const gainNode1 = engine.getOrCreateClipGain(clip1.id) as any;
        const gainNode2 = engine.getOrCreateClipGain(clip2.id) as any;

        // Context anchor is 100s, playhead is at 0s
        engine.applyCrossfade(clip1, clip2, 100, { value: 0, rate: 1 });

        // Right clip starts at 9 on timeline -> 109 in context
        // Overlap ends at 10 on timeline -> 110 in context
        expect(gainNode1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, 110);
        expect(gainNode2.gain.setValueAtTime).toHaveBeenCalledWith(0, 109);
        expect(gainNode2.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 110);
    });
});

describe('WebAudioEngineManager Routes R5.1', () => {
    let engine: WebAudioEngineManager;
    beforeEach(() => {
        globalThis.window = {
            AudioContext: MockAudioContext,
            setInterval: vi.fn(),
            clearInterval: vi.fn()
        } as any;
        engine = new WebAudioEngineManager();
        engine.init(48000);
    });
    test('seam math avoids float accumulation (zero drift)', () => {
        // Create an extreme rational fraction (e.g., 1/3) that would accumulate float drift
        const clip1: Clip = {
            id: 'c1', assetId: 'a1', name: 'clip1',
            startOffset: { value: 0, rate: 3 },
            sourceIn: { value: 0, rate: 3 },
            sourceOut: { value: 1, rate: 3 },
            duration: { value: 1, rate: 3 } // ends at 1/3
        };
        const clip2: Clip = {
            id: 'c2', assetId: 'a2', name: 'clip2',
            startOffset: { value: 1, rate: 3 }, // starts at 1/3
            sourceIn: { value: 0, rate: 3 },
            sourceOut: { value: 1, rate: 3 },
            duration: { value: 1, rate: 3 }
        };

        const gainNode1 = engine.getOrCreateClipGain(clip1.id) as any;
        const gainNode2 = engine.getOrCreateClipGain(clip2.id) as any;

        // Context anchor is 0, playhead is at 0
        engine.applyMicroCrossfade(clip1, clip2, 0, { value: 0, rate: 1 });

        // Expected float target for 1/3 is exactly 1/3
        const seamTime = 1 / 3;

        // Ensure that the calculated schedule matches exactly our single float conversion
        // and doesn't drift by adding multiple floats.
        expect(gainNode1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, seamTime);
        expect(gainNode2.gain.setValueAtTime).toHaveBeenCalledWith(0, seamTime);
    });

    test('routes track correctly to graph buses based on track id', () => {
        const dialogueGain = engine.getOrCreateTrackGain('dialogue_1') as any;
        expect(dialogueGain.connect).toHaveBeenCalled();

        const musicGain = engine.getOrCreateTrackGain('music_1') as any;
        expect(musicGain.connect).toHaveBeenCalled();

        const sfxGain = engine.getOrCreateTrackGain('sfx_1') as any;
        expect(sfxGain.connect).toHaveBeenCalled();

        const otherGain = engine.getOrCreateTrackGain('v1') as any;
        expect(otherGain.connect).toHaveBeenCalled();
    });
});
