import { Command } from './index';
import { TimelineState, TitleSpec } from '../../types/timeline';
import { RationalTime } from '../../types/time';
import { validateTitleSpec } from '../../engine/titles';

/**
 * R24.4 — places a title clip on a video track (undoable). Titles overlay,
 * so insertion never ripples: the clip is appended to the track's items.
 */
export class AddTitleClipCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly trackId: string,
    private readonly clipId: string,
    private readonly spec: TitleSpec,
    private readonly startOffset: RationalTime,
    private readonly duration: RationalTime
  ) {
    validateTitleSpec(spec);
  }

  apply(state: TimelineState): TimelineState {
    const track = state.tracks.find((t) => t.id === this.trackId);
    if (!track) throw new Error(`Track with id ${this.trackId} not found`);
    if (track.type !== 'video') throw new Error(`Titles require a video track (got ${track.type})`);
    if (track.locked) throw new Error(`Track ${track.id} is locked`);
    if (track.clips.some((c) => c.id === this.clipId)) {
      throw new Error(`Clip with id ${this.clipId} already exists`);
    }
    this.previousState = state;
    const titleClip = {
      id: this.clipId,
      assetId: `title://${this.clipId}`,
      name: this.spec.text.split('\n')[0].slice(0, 48),
      startOffset: this.startOffset,
      sourceIn: this.startOffset,
      sourceOut: this.startOffset,
      duration: this.duration,
      title: { ...this.spec, box: { ...this.spec.box } },
    };
    return {
      ...state,
      tracks: state.tracks.map((t) =>
        t.id !== this.trackId ? t : { ...t, clips: [...t.clips, titleClip] }
      ),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

/** R24.4 — patches a title spec on a title clip (undoable). */
export class UpdateTitleCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly patch: Partial<TitleSpec>
  ) {}

  apply(state: TimelineState): TimelineState {
    let found = false;
    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (clip) {
        found = true;
        if (track.locked) throw new Error(`Track ${track.id} is locked`);
        if (!clip.title) throw new Error(`Clip ${this.clipId} is not a title clip`);
        validateTitleSpec({ ...clip.title, ...this.patch });
        break;
      }
    }
    if (!found) throw new Error(`Clip with id ${this.clipId} not found`);
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id !== this.clipId || !c.title ? c : { ...c, title: { ...c.title, ...this.patch } }
        ),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}
