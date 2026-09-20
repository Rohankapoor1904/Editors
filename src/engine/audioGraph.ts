export interface DuckingConfig {
    sourceBus: string;
    targetBus: string;
    threshold: number;
    duckingGain: number;
    attack: number;
    release: number;
    enabled?: boolean;
}

export class AudioBus {
    public input: GainNode;
    public sidechainGain: GainNode;
    public output: GainNode;
    public analyser: AnalyserNode;

    constructor(ctx: AudioContext, _name: string) {
        this.input = ctx.createGain();
        this.sidechainGain = ctx.createGain();
        this.output = ctx.createGain();
        this.analyser = ctx.createAnalyser();

        // Chain: input -> sidechainGain -> output
        this.input.connect(this.sidechainGain);
        this.sidechainGain.connect(this.output);

        // Split input to analyser for level detection
        this.input.connect(this.analyser);
    }
}

export class AudioGraph {
    private ctx: AudioContext;
    private buses: Map<string, AudioBus> = new Map();
    private duckingRules: DuckingConfig[] = [];
    private processIntervalId: number | null = null;
    private analysisBuffer: Float32Array;
    private duckingActive: Map<string, boolean> = new Map();

    constructor(ctx: AudioContext) {
        this.ctx = ctx;
        this.analysisBuffer = new Float32Array(2048);
        this.createBus('master');
        this.getBus('master')!.output.connect(this.ctx.destination);
    }

    createBus(name: string): AudioBus {
        if (!this.buses.has(name)) {
            const bus = new AudioBus(this.ctx, name);
            if (name !== 'master') {
                const master = this.getBus('master');
                if (master) {
                    bus.output.connect(master.input);
                }
            }
            this.buses.set(name, bus);
        }
        return this.buses.get(name)!;
    }

    getBus(name: string): AudioBus | undefined {
        return this.buses.get(name);
    }

    addDucking(config: DuckingConfig) {
        if (config.enabled === undefined) config.enabled = true;
        this.duckingRules.push(config);
    }

    getDuckingConfig(sourceBus: string, targetBus: string): DuckingConfig | undefined {
        return this.duckingRules.find(r => r.sourceBus === sourceBus && r.targetBus === targetBus);
    }

    getAllDuckingConfigs(): DuckingConfig[] {
        return [...this.duckingRules];
    }

    updateDucking(sourceBus: string, targetBus: string, updates: Partial<DuckingConfig>) {
        const rule = this.getDuckingConfig(sourceBus, targetBus);
        if (rule) {
            Object.assign(rule, updates);
            if (updates.enabled === false) {
                const target = this.buses.get(targetBus);
                if (target) {
                    const now = this.ctx.currentTime;
                    target.sidechainGain.gain.cancelScheduledValues(now);
                    target.sidechainGain.gain.setTargetAtTime(1.0, now, 0.05);
                }
                this.duckingActive.set(`${sourceBus}-${targetBus}`, false);
            }
        }
    }

    isDuckingActive(sourceBus: string, targetBus: string): boolean {
        return !!this.duckingActive.get(`${sourceBus}-${targetBus}`);
    }

    startDuckingProcessor() {
        if (this.processIntervalId === null && typeof window !== 'undefined') {
            this.processIntervalId = window.setInterval(() => this.processDucking(), 16) as unknown as number; // ~60fps processing
        }
    }

    stopDuckingProcessor() {
        if (this.processIntervalId !== null && typeof window !== 'undefined') {
            window.clearInterval(this.processIntervalId);
            this.processIntervalId = null;
        }
    }

    processDucking() {
        for (const rule of this.duckingRules) {
            if (rule.enabled === false) continue;

            const source = this.buses.get(rule.sourceBus);
            const target = this.buses.get(rule.targetBus);

            if (!source || !target) continue;

            source.analyser.getFloatTimeDomainData(this.analysisBuffer as any);

            let sumSquares = 0;
            for (let i = 0; i < this.analysisBuffer.length; i++) {
                sumSquares += this.analysisBuffer[i] * this.analysisBuffer[i];
            }
            const rms = Math.sqrt(sumSquares / this.analysisBuffer.length);

            const ruleId = `${rule.sourceBus}-${rule.targetBus}`;

            const currentlyDucking = this.duckingActive.get(ruleId);
            const shouldDuck = rms > rule.threshold;

            if (currentlyDucking !== shouldDuck) {
                const now = this.ctx.currentTime;
                target.sidechainGain.gain.cancelScheduledValues(now);

                if (shouldDuck) {
                    target.sidechainGain.gain.setTargetAtTime(rule.duckingGain, now, rule.attack);
                } else {
                    target.sidechainGain.gain.setTargetAtTime(1.0, now, rule.release);
                }
                this.duckingActive.set(ruleId, shouldDuck);
            }
        }
    }
}
