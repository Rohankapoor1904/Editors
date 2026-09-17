export interface EqBand {
  frequency: number; // Hz
  gainDb: number;    // -12dB to +12dB
  q: number;         // Quality factor
  type: BiquadFilterType;
}

export class ParametricEqEngine {
  private filters: BiquadFilterNode[] = [];

  init(ctx: AudioContext, bands?: EqBand[]): BiquadFilterNode[] {
    const defaultFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

    let eqBands = bands;
    if (!eqBands) {
      eqBands = defaultFrequencies.map((freq, idx) => {
        let type: BiquadFilterType = 'peaking';
        if (idx === 0) type = 'lowshelf';
        else if (idx === defaultFrequencies.length - 1) type = 'highshelf';

        return {
          frequency: freq,
          gainDb: 0,
          q: 1.414,
          type
        };
      });
    }

    this.filters = eqBands.map(band => {
      const filter = ctx.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.frequency;
      filter.Q.value = band.q;
      filter.gain.value = band.gainDb;
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

  setBandFrequency(bandIndex: number, frequencyHz: number) {
    if (this.filters[bandIndex]) {
      this.filters[bandIndex].frequency.value = frequencyHz;
    }
  }

  setBandQ(bandIndex: number, q: number) {
    if (this.filters[bandIndex]) {
      this.filters[bandIndex].Q.value = q;
    }
  }
}

export const parametricEqEngine = new ParametricEqEngine();
