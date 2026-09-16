import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transportEngine } from '../engine/transport';
import { audioEngine } from '../engine/audioEngine';
import { useTimelineStore } from '../store/timelineStore';
import { secondsToRational, subRational, rationalToSeconds } from '../types/time';

describe('Audio Master Clock (R2.4)', () => {
    let mockAudioTime = 0;
    let rAFCallbacks: Array<FrameRequestCallback> = [];

    beforeEach(() => {
        mockAudioTime = 0;
        rAFCallbacks = [];

        // Mock the timeline store state
        useTimelineStore.setState({
            playheadPosition: secondsToRational(0.0),
            metadata: {
                ...useTimelineStore.getState().metadata,
                fps: 60, // 60fps
            },
            tracks: [
                {
                    id: 'track_v1',
                    type: 'video',
                    index: 0,
                    name: 'V1',
                    muted: false,
                    locked: false,
                    solo: false,
                    height: 72,
                    clips: [
                        {
                            id: 'clip_v1_001',
                            assetId: 'asset_01',
                            name: 'Test.mp4',
                            startOffset: secondsToRational(0.0),
                            sourceIn: secondsToRational(0.0),
                            sourceOut: secondsToRational(3600.0), // 1 hour long clip to prevent pausing
                            duration: secondsToRational(3600.0),
                            transform: {
                              position: { x: 0, y: 0 },
                              scale: { x: 1, y: 1 },
                              rotation: 0,
                              opacity: 1,
                              anchorPoint: { x: 0.5, y: 0.5 }
                            }
                        }
                    ]
                }
            ]
        });

        // Mock audioEngine.getCurrentTime
        vi.spyOn(audioEngine, 'getCurrentTime').mockImplementation(() => mockAudioTime);
        vi.spyOn(audioEngine, 'resumeContext').mockResolvedValue();

        // Mock requestAnimationFrame and cancelAnimationFrame
        globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
            rAFCallbacks.push(cb);
            return rAFCallbacks.length;
        });

        globalThis.cancelAnimationFrame = vi.fn(() => {
            rAFCallbacks = [];
        });
    });

    afterEach(() => {
        transportEngine.pause();
        vi.restoreAllMocks();
    });

    it('test with a VFR fixture: after 60s of playback, A/V offset stays < 1 frame', () => {
        transportEngine.play();

        // Simulate 60 seconds of playback with some jitter (VFR-like conditions)
        // Let's do 60 seconds with ~16.6ms intervals but adding jitter
        const targetDurationSec = 60.0;
        const baseIntervalSec = 1 / 60;

        while (mockAudioTime < targetDurationSec) {
            // Add some jitter to the rAF firing time, mimicking VFR
            const jitterSec = (Math.random() - 0.5) * 0.01; // +/- 5ms
            let step = baseIntervalSec + jitterSec;

            // Ensure step is positive and doesn't overshoot 60s
            if (step < 0.001) step = 0.001;
            if (mockAudioTime + step > targetDurationSec) {
                step = targetDurationSec - mockAudioTime;
            }

            mockAudioTime += step;

            // Fire the pending rAF callbacks
            const callbacksToRun = [...rAFCallbacks];
            rAFCallbacks = [];
            callbacksToRun.forEach(cb => cb(performance.now()));
        }

        transportEngine.pause();

        const playhead = useTimelineStore.getState().playheadPosition;

        // Exact expected duration is 60 seconds
        const expectedDuration = secondsToRational(60.0, 60000);

        // Calculate offset (difference between playhead and expected duration)
        const diff = subRational(playhead, expectedDuration);
        const offsetSec = Math.abs(rationalToSeconds(diff));

        // 1 frame at 60fps = 1/60 sec ~= 0.0166 sec
        const frameThresholdSec = 1 / 60;

        expect(offsetSec).toBeLessThan(frameThresholdSec);

        // Due to strict rational time math, the offset should actually be 0 or extremely close
        console.log(`Final offset after 60s playback: ${offsetSec} seconds`);
    });
});
