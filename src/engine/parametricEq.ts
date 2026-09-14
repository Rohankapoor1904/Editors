export interface EqBand {
  frequency: number; // Hz (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k)
  gainDb: number;    // -12dB to +12dB
  q: number;         // Quality factor
  type: BiquadFilterType;
}

export class ParametricEqEngine {
  private filters: BiquadFilterNode[] = [];

  init(ctx: AudioContext, frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]): BiquadFilterNode[] {
    this.filters = frequencies.map((freq, idx) => {
      const filter = ctx.createBiquadFilter();
      filter.frequency.value = freq;
      filter.Q.value = 1.414;
      filter.gain.value = 0;

      if (idx === 0) {
        filter.type = 'lowshelf';
      } else if (idx === frequencies.length - 1) {
        filter.type = 'highshelf';
      } else {
        filter.type = 'peaking';
      }
      return filter;
    });

    // Chain filters sequentially
    for (let i = 0; i < this.filters.length - 1; i++) {
      this.filters[i].connect(this.filters[i + 1]);
    }

    return this.filters;
  }

  setBandGain(bandIndex: number, gainDb: number) {
    if (this.filters[bandIndex]) {
      this.filters[bandIndex].gain.value = gainDb;
    }
  }
}

export const parametricEqEngine = new ParametricEqEngine();
