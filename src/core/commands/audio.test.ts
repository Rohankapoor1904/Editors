import { describe, test, expect } from 'vitest';
import { ApplyClipGainCommand, ApplyCrossfadeCommand } from './audio';
import { TimelineState } from '../../types/timeline';

describe('Audio Commands', () => {
    const initialState: TimelineState = {
        version: '1',
        projectId: 'p1',
        metadata: { name: 'Test', fps: 60, width: 1920, height: 1080, sampleRate: 48000, colorSpace: 'rec709' },
        playheadPosition: { value: 0, rate: 60000 },
        inPoint: null,
        outPoint: null,
        selectedClipIds: [],
        activeWorkspace: 'audio',
        magneticSnapping: true,
        zoomLevel: 100,
        tracks: [
            {
                id: 't1', type: 'audio', index: 0, name: 'A1', muted: false, locked: false, solo: false, height: 100,
                clips: [
                    { id: 'c1', assetId: 'a1', name: 'clip1', startOffset: { value: 0, rate: 1 }, sourceIn: { value: 0, rate: 1 }, sourceOut: { value: 10, rate: 1 }, duration: { value: 10, rate: 1 }, volume: 0 },
                    { id: 'c2', assetId: 'a2', name: 'clip2', startOffset: { value: 10, rate: 1 }, sourceIn: { value: 0, rate: 1 }, sourceOut: { value: 10, rate: 1 }, duration: { value: 10, rate: 1 } }
                ]
            }
        ]
    };

    test('ApplyClipGainCommand', () => {
        const cmd = new ApplyClipGainCommand('c1', -6);
        const nextState = cmd.apply(initialState);
        expect(nextState.tracks[0].clips[0].volume).toBe(-6);
        expect(nextState.tracks[0].clips[1].volume).toBeUndefined(); // or whatever default it has

        const inverted = cmd.invert(nextState);
        expect(inverted.tracks[0].clips[0].volume).toBe(0);
    });

    test('ApplyCrossfadeCommand', () => {
        const cmd = new ApplyCrossfadeCommand('c1', 'c2', { value: 1, rate: 1 });
        const nextState = cmd.apply(initialState);
        const c2 = nextState.tracks[0].clips[1];
        expect(c2.audioEffects?.length).toBe(1);
        expect(c2.audioEffects![0].type).toBe('crossfade');
        expect(c2.audioEffects![0].params).toEqual({ leftClipId: 'c1', duration: { value: 1, rate: 1 } });
    });
});
