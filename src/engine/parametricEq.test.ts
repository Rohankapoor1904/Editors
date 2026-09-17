import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParametricEqEngine } from './parametricEq';

describe('ParametricEqEngine', () => {
  let ctx: any;
  let eq: ParametricEqEngine;

  beforeEach(() => {
    ctx = {
      createBiquadFilter: vi.fn(() => {
        let type = '';
        const freqObj = { _val: 0, get value() { return this._val; }, set value(v) { this._val = v; } };
        const qObj = { _val: 0, get value() { return this._val; }, set value(v) { this._val = v; } };
        const gainObj = { _val: 0, get value() { return this._val; }, set value(v) { this._val = v; } };

        return {
          frequency: freqObj,
          Q: qObj,
          gain: gainObj,
          get type() { return type; },
          set type(v) { type = v; },
          connect: vi.fn(),
          getFrequencyResponse: vi.fn((frequencyArray: Float32Array, magResponse: Float32Array, phaseResponse: Float32Array) => {
            // Calculate actual biquad filter magnitude response for a peaking filter
            // Using standard Audio EQ Cookbook formulas
            for (let i = 0; i < frequencyArray.length; i++) {
              const f = frequencyArray[i];
              const f0 = freqObj.value;
              const dBgain = gainObj.value;
              const Q = qObj.value;

              if (type === 'peaking' && f0 > 0 && Q > 0) {
                 const A = Math.pow(10, dBgain / 40);
                 const w0 = 2 * Math.PI * f / 48000; // Assuming 48kHz sample rate for math
                 const w0_center = 2 * Math.PI * f0 / 48000;
                 const alpha = Math.sin(w0_center) / (2 * Q);

                 const b0 = 1 + alpha * A;
                 const b1 = -2 * Math.cos(w0_center);
                 const b2 = 1 - alpha * A;
                 const a0 = 1 + alpha / A;
                 const a1 = -2 * Math.cos(w0_center);
                 const a2 = 1 - alpha / A;

                 // Transfer function H(z) magnitude at w0
                 const cos_w = Math.cos(w0);
                 const cos_2w = Math.cos(2 * w0);

                 const num = b0*b0 + b1*b1 + b2*b2 + 2*(b0*b1 + b1*b2)*cos_w + 2*b0*b2*cos_2w;
                 const den = a0*a0 + a1*a1 + a2*a2 + 2*(a0*a1 + a1*a2)*cos_w + 2*a0*a2*cos_2w;

                 magResponse[i] = Math.sqrt(num / den);
              } else {
                 magResponse[i] = 1.0;
              }
              phaseResponse[i] = 0;
            }
          })
        };
      })
    };
    eq = new ParametricEqEngine();
  });

  it('initializes 10 bands correctly', () => {
    const filters = eq.init(ctx);
    expect(filters.length).toBe(10);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(10);

    expect(filters[0].type).toBe('lowshelf');
    expect(filters[9].type).toBe('highshelf');
    expect(filters[5].type).toBe('peaking');
  });

  it('sets band gain, Q, and frequency correctly', () => {
    eq.init(ctx);
    eq.setBandGain(5, 6.0);
    eq.setBandQ(5, 2.0);
    eq.setBandFrequency(5, 1200);

    const filters = (eq as any).filters;
    expect(filters[5].gain.value).toBe(6.0);
    expect(filters[5].Q.value).toBe(2.0);
    expect(filters[5].frequency.value).toBe(1200);
  });

  it('a +6dB band boost at 1kHz measurably lifts 1kHz vs. 100Hz in the rendered output', () => {
    eq.init(ctx);

    eq.setBandGain(5, 6.0);

    const filters = (eq as any).filters;
    const band5Filter = filters[5];

    const freqArray = new Float32Array([100, 1000]);
    const magResponse = new Float32Array(2);
    const phaseResponse = new Float32Array(2);

    band5Filter.getFrequencyResponse(freqArray, magResponse, phaseResponse);

    expect(magResponse[1]).toBeGreaterThan(magResponse[0]);
    expect(magResponse[1]).toBeGreaterThan(1.9); // +6dB is ~1.995 linear
    expect(magResponse[0]).toBeLessThan(1.1); // Should not boost 100Hz significantly
  });
});
