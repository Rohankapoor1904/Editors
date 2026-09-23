/**
 * R26.2 — 5.1 surround scaffold: channel layout model and ITU downmix.
 *
 * The live graph is stereo end-to-end today; full 5.1 routing needs
 * channelCount plumbing plus hardware verification, so this module ships
 * the parts that are exactly testable now: the canonical channel order,
 * the standard Lo/Ro downmix gains, and validation. Export normalization
 * and the future surround bus consume these — nothing here pretends a
 * 5.1 bus already exists in the graph.
 */

export const SURROUND_51_CHANNELS = ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'] as const;
export type Surround51Channel = (typeof SURROUND_51_CHANNELS)[number];

export type Surround51Frame = Record<Surround51Channel, number>;

/** Center/surround fold-down gain: 10^(-3dB/20) ≈ 0.7071. */
export const SURROUND_FOLD_GAIN = Math.SQRT1_2;

function checkFrame(frame: Surround51Frame, label: string): void {
  if (!frame) throw new Error(`surround: ${label} frame is required`);
  for (const ch of SURROUND_51_CHANNELS) {
    const v = frame[ch];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`surround: ${label} channel '${ch}' must be finite`);
    }
  }
}

/**
 * R26.2 — ITU-R BS.775 Lo/Ro downmix:
 *   Lo = L + 0.707·C + 0.707·Ls   (LFE dropped, documented)
 *   Ro = R + 0.707·C + 0.707·Rs
 */
export function downmix51ToStereo(frame: Surround51Frame): { left: number; right: number } {
  checkFrame(frame, 'downmix input');
  return {
    left: frame.L + SURROUND_FOLD_GAIN * frame.C + SURROUND_FOLD_GAIN * frame.Ls,
    right: frame.R + SURROUND_FOLD_GAIN * frame.C + SURROUND_FOLD_GAIN * frame.Rs,
  };
}

/**
 * R26.2 — stereo upmix scaffold: L/R pass through, center carries the
 * mono-compatible mid, surrounds/LFE stay silent (explicit, tested).
 */
export function upmixStereoTo51(left: number, right: number): Surround51Frame {
  for (const [name, v] of [['left', left], ['right', right]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`surround: ${name} must be finite`);
    }
  }
  return { L: left, R: right, C: (left + right) / 2, LFE: 0, Ls: 0, Rs: 0 };
}
