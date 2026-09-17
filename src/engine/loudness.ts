import { getRuntimeMode } from '../services/runtimeConfig';

class Biquad {
    private b0: number;
    private b1: number;
    private b2: number;
    private a1: number;
    private a2: number;
    private z1: number;
    private z2: number;

    constructor(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
        this.b0 = b0 / a0;
        this.b1 = b1 / a0;
        this.b2 = b2 / a0;
        this.a1 = a1 / a0;
        this.a2 = a2 / a0;
        this.z1 = 0;
        this.z2 = 0;
    }
    process(input: Float32Array): Float32Array {
        const out = new Float32Array(input.length);
        for(let i = 0; i < input.length; i++) {
            const x = input[i];
            const y = x * this.b0 + this.z1;
            this.z1 = x * this.b1 - y * this.a1 + this.z2;
            this.z2 = x * this.b2 - y * this.a2;
            out[i] = y;
        }
        return out;
    }
}

// 48kHz coefficients for BS.1770-4
const preFilterB0 = 1.53512485958697;
const preFilterB1 = -2.69169618940638;
const preFilterB2 = 1.19839281085285;
const preFilterA0 = 1.0;
const preFilterA1 = -1.69065929318241;
const preFilterA2 = 0.73248077421585;

const rlbFilterB0 = 1.0;
const rlbFilterB1 = -2.0;
const rlbFilterB2 = 1.0;
const rlbFilterA0 = 1.0;
const rlbFilterA1 = -1.99004745483398;
const rlbFilterA2 = 0.99007225036621;

const channelWeights = [1.0, 1.0, 1.0, 1.41, 1.41]; // L, R, C, Ls, Rs

export interface LoudnessMeasurement {
    integrated: number;
    truePeak: number;
}

export class NotImplementedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export function measureLUFS(channels: Float32Array[], sampleRate: number): LoudnessMeasurement {
    if (sampleRate !== 48000) {
        throw new NotImplementedError(`Sample rate ${sampleRate} is not supported. Only 48kHz is implemented.`);
    }

    if (!channels || channels.length === 0) return { integrated: -Infinity, truePeak: -Infinity };

    const filteredChannels = channels.map(c => {
        const pf = new Biquad(preFilterB0, preFilterB1, preFilterB2, preFilterA0, preFilterA1, preFilterA2);
        const rf = new Biquad(rlbFilterB0, rlbFilterB1, rlbFilterB2, rlbFilterA0, rlbFilterA1, rlbFilterA2);
        return rf.process(pf.process(c));
    });

    const blockSize = Math.floor(sampleRate * 0.4);
    const stepSize = Math.floor(sampleRate * 0.1);
    const numSamples = channels[0].length;

    const blocks: number[] = [];
    for (let i = 0; i <= numSamples - blockSize; i += stepSize) {
        let blockEnergySum = 0;
        for (let ch = 0; ch < filteredChannels.length; ch++) {
            let chSum = 0;
            const c = filteredChannels[ch];
            for (let j = 0; j < blockSize; j++) {
                chSum += c[i + j] * c[i + j];
            }
            const meanSquare = chSum / blockSize;
            const weight = channelWeights[ch] || 1.0;
            blockEnergySum += weight * meanSquare;
        }
        blocks.push(blockEnergySum);
    }

    const absoluteThreshold = Math.pow(10, (-70 + 0.691) / 10);
    const absGatedBlocks = blocks.filter(e => e > absoluteThreshold);

    if (absGatedBlocks.length === 0) return { integrated: -Infinity, truePeak: calculateTruePeak(channels) };

    const absGatedMeanEnergy = absGatedBlocks.reduce((a, b) => a + b, 0) / absGatedBlocks.length;
    const absGatedLoudness = -0.691 + 10 * Math.log10(absGatedMeanEnergy);

    const relativeThresholdEnergy = Math.pow(10, (absGatedLoudness - 10 + 0.691) / 10);
    const relGatedBlocks = absGatedBlocks.filter(e => e > relativeThresholdEnergy);

    if (relGatedBlocks.length === 0) return { integrated: -Infinity, truePeak: calculateTruePeak(channels) };

    const relGatedMeanEnergy = relGatedBlocks.reduce((a, b) => a + b, 0) / relGatedBlocks.length;
    const integratedLoudness = -0.691 + 10 * Math.log10(relGatedMeanEnergy);

    return { integrated: integratedLoudness, truePeak: calculateTruePeak(channels) };
}

function calculateTruePeak(channels: Float32Array[]): number {
    if (getRuntimeMode() === 'live') {
        throw new NotImplementedError("True Peak calculation via 4x oversampling is not yet implemented. Cannot use sample peak.");
    }
    // Return sample peak in demo mode.
    let peak = 0;
    for (const ch of channels) {
        for (let i = 0; i < ch.length; i++) {
            const absVal = Math.abs(ch[i]);
            if (absVal > peak) peak = absVal;
        }
    }
    if (peak === 0) return -Infinity;
    return 20 * Math.log10(peak);
}
