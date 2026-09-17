import { describe, test, expect, beforeEach, vi } from 'vitest';
import { AudioGraph } from './audioGraph';

class MockAudioParam {
    value: number = 1.0;
    setTargetAtTime = vi.fn();
    setValueAtTime = vi.fn();
    linearRampToValueAtTime = vi.fn();
    cancelScheduledValues = vi.fn();
}

class MockGainNode {
    gain = new MockAudioParam();
    connect = vi.fn();
}

class MockAnalyserNode {
    fftSize: number = 2048;
    connect = vi.fn();
    _mockData: Float32Array = new Float32Array(2048);

    getFloatTimeDomainData(array: Float32Array) {
        array.set(this._mockData);
    }
}

class MockAudioContext {
    private _currentTime: number = 0;
    get currentTime() { return this._currentTime; }
    set currentTime(v: number) { this._currentTime = v; }
    destination: any = {};
    createGain() { return new MockGainNode(); }
    createAnalyser() { return new MockAnalyserNode(); }
}

describe('AudioGraph R5.1', () => {
    let ctx: MockAudioContext;
    let graph: AudioGraph;

    beforeEach(() => {
        globalThis.window = {
            setInterval: vi.fn(),
            clearInterval: vi.fn()
        } as any;
        ctx = new MockAudioContext();
        graph = new AudioGraph(ctx as unknown as AudioContext);
    });

    test('creates master bus on init', () => {
        const master = graph.getBus('master');
        expect(master).toBeDefined();
        // Master should connect to destination
        expect((master!.output as any).connect).toHaveBeenCalledWith(ctx.destination);
    });

    test('music bus ducks by the configured amount only while dialogue is present, attack/release measured', () => {
        graph.createBus('dialogue');
        graph.createBus('music');

        graph.addDucking({
            sourceBus: 'dialogue',
            targetBus: 'music',
            threshold: 0.1, // linear RMS
            duckingGain: 0.25,
            attack: 0.05,
            release: 0.2
        });

        const dialogueBus = graph.getBus('dialogue')!;
        const musicBus = graph.getBus('music')!;
        const analyser = dialogueBus.analyser as any;
        const sidechainGain = musicBus.sidechainGain.gain as any;

        // Simulate silence
        analyser._mockData.fill(0);
        ctx.currentTime = 1.0;
        graph.processDucking();

        // Should release to 1.0
        expect(sidechainGain.setTargetAtTime).toHaveBeenCalledWith(1.0, 1.0, 0.2);

        // Simulate loud dialogue (RMS > 0.1)
        analyser._mockData.fill(0.5);
        ctx.currentTime = 2.0;
        graph.processDucking();

        // Should attack to 0.25
        expect(sidechainGain.setTargetAtTime).toHaveBeenCalledWith(0.25, 2.0, 0.05);
    });
});
