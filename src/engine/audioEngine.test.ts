import { describe, test, expect, beforeEach, vi } from 'vitest';
import { WebAudioEngineManager } from './audioEngine';
import { Clip } from '../types/timeline';

// Mock WebAudio API for tests
class MockGainNode {
    gain: any;
    connect = vi.fn();
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
        engine.applyCrossfade(clip1, clip2, 100, 0);

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
