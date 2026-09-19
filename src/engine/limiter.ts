export class LimiterEngine {
    private compressor: DynamicsCompressorNode | null = null;
    private lookaheadDelay: DelayNode | null = null;
    private attackTime = 0.001; // 1ms

    init(ctx: AudioContext): { input: GainNode, output: AudioNode } {
        const input = ctx.createGain();
        this.compressor = ctx.createDynamicsCompressor();
        this.lookaheadDelay = ctx.createDelay();

        // In WebAudio, true lookahead requires delaying the main signal while
        // passing the undelayed signal to a sidechain. But DynamicsCompressorNode
        // doesn't expose a sidechain input natively.
        // For standard WebAudio node graphs, limiting is achieved by compressing the signal.
        // We delay the input signal to represent algorithmic latency that would be required for a true lookahead.

        // Brickwall limiter settings
        this.compressor.threshold.value = -0.1; // -0.1 dB
        this.compressor.knee.value = 0.0;       // Hard knee
        this.compressor.ratio.value = 20.0;     // High ratio for brickwall
        this.compressor.attack.value = this.attackTime;   // Fast attack (1ms)
        this.compressor.release.value = 0.1;    // 100ms release

        // Set delay to represent lookahead time (1ms)
        this.lookaheadDelay.delayTime.value = this.attackTime;

        // Route: input -> delay -> compressor -> output
        input.connect(this.lookaheadDelay);
        this.lookaheadDelay.connect(this.compressor);

        return {
            input,
            output: this.compressor
        };
    }

    getLatency(): number {
        return this.attackTime; // PDC latency compensation
    }

    setThreshold(db: number) {
        if (this.compressor) {
            this.compressor.threshold.value = db;
        }
    }

    setRelease(seconds: number) {
        if (this.compressor) {
            this.compressor.release.value = seconds;
        }
    }
}

export const limiterEngine = new LimiterEngine();
