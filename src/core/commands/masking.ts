import { Command } from './index';
import { TimelineState, Track, Clip, ClipMask } from '../../types/timeline';
import { validateMask } from '../../engine/masking/maskTypes';

function findClipTarget(state: TimelineState, clipId: string): { track: Track; clip: Clip } {
  for (const track of state.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  throw new Error(`Clip with id ${clipId} not found`);
}

/** R24.1 — attaches a validated subject mask to a clip (undoable). */
export class AddMaskCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly mask: ClipMask
  ) {
    validateMask(mask);
  }

  apply(state: TimelineState): TimelineState {
    const { track, clip } = findClipTarget(state, this.clipId);
    if (track.locked) {
      throw new Error(`Track ${track.id} is locked`);
    }
    if ((clip.masks ?? []).some((m) => m.id === this.mask.id)) {
      throw new Error(`Mask with id ${this.mask.id} already exists on clip ${this.clipId}`);
    }
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => {
        if (t.id !== track.id) return t;
        return {
          ...t,
          clips: t.clips.map((c) =>
            c.id !== this.clipId ? c : { ...c, masks: [...(c.masks ?? []), { ...this.mask }] }
          ),
        };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

/** R24.1 — patches a single mask field-set on a clip (undoable). */
export class UpdateMaskCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly maskId: string,
    private readonly patch: Omit<Partial<ClipMask>, 'id'>
  ) {}

  apply(state: TimelineState): TimelineState {
    const { track, clip } = findClipTarget(state, this.clipId);
    if (track.locked) {
      throw new Error(`Track ${track.id} is locked`);
    }
    const existing = (clip.masks ?? []).find((m) => m.id === this.maskId);
    if (!existing) {
      throw new Error(`Mask with id ${this.maskId} not found on clip ${this.clipId}`);
    }
    validateMask({ ...existing, ...this.patch });
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => {
        if (t.id !== track.id) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== this.clipId) return c;
            return {
              ...c,
              masks: (c.masks ?? []).map((m) => (m.id === this.maskId ? { ...m, ...this.patch } : m)),
            };
          }),
        };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

/** R24.1 — removes a mask from a clip (undoable). */
export class RemoveMaskCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly maskId: string
  ) {}

  apply(state: TimelineState): TimelineState {
    const { track, clip } = findClipTarget(state, this.clipId);
    if (track.locked) {
      throw new Error(`Track ${track.id} is locked`);
    }
    if (!(clip.masks ?? []).some((m) => m.id === this.maskId)) {
      throw new Error(`Mask with id ${this.maskId} not found on clip ${this.clipId}`);
    }
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => {
        if (t.id !== track.id) return t;
        return {
          ...t,
          clips: t.clips.map((c) =>
            c.id !== this.clipId ? c : { ...c, masks: (c.masks ?? []).filter((m) => m.id !== this.maskId) }
          ),
        };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}
