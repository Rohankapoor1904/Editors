import { Command } from './index';
import { TimelineState, Track, Clip } from '../../types/timeline';
import { createRational, compareRational, addRational, subRational } from '../../types/time';

/**
 * R26.1 — compound (nested) clips, depth-1.
 *
 * Nesting replaces a set of same-track clips with one container holding
 * the children at span-relative offsets. Unnesting restores them at
 * absolute positions. Both are undoable. Nesting a compound, mixing
 * tracks, or touching locked tracks throws — single-level containers
 * keep the command layer (which resolves clips by track scan) honest.
 */

function findTrack(state: TimelineState, trackId: string): Track {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) throw new Error(`Track with id ${trackId} not found`);
  if (track.locked) throw new Error(`Track ${trackId} is locked`);
  return track;
}

export class NestClipsCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly trackId: string,
    private readonly clipIds: string[],
    private readonly compoundId: string,
    private readonly name?: string
  ) {
    if (!Array.isArray(clipIds) || clipIds.length < 2) {
      throw new Error('NestClipsCommand needs at least 2 clip ids');
    }
    if (!compoundId) throw new Error('NestClipsCommand needs a compound id');
  }

  apply(state: TimelineState): TimelineState {
    const track = findTrack(state, this.trackId);
    const picked = this.clipIds.map((id) => {
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) throw new Error(`Clip with id ${id} not found on track ${this.trackId}`);
      if (clip.compound) throw new Error(`Clip ${id} is already a compound (depth-1 limit)`);
      return clip;
    });

    const ordered = [...picked].sort((a, b) => compareRational(a.startOffset, b.startOffset));
    const spanStart = ordered[0].startOffset;
    const spanEnd = ordered.reduce(
      (end, c) => (compareRational(addRational(c.startOffset, c.duration), end) > 0
        ? addRational(c.startOffset, c.duration)
        : end),
      addRational(ordered[0].startOffset, ordered[0].duration)
    );
    const span = subRational(spanEnd, spanStart);
    const firstIndex = track.clips.findIndex((c) => c.id === ordered[0].id);

    const compound: Clip = {
      id: this.compoundId,
      assetId: `compound://${this.compoundId}`,
      name: this.name ?? `Compound (${ordered.length} clips)`,
      startOffset: spanStart,
      sourceIn: createRational(0, 1),
      sourceOut: span,
      duration: span,
      compound: {
        name: this.name ?? `Compound (${ordered.length} clips)`,
        clips: ordered.map((c) => ({
          ...c,
          startOffset: subRational(c.startOffset, spanStart),
        })),
      },
    };

    this.previousState = state;
    const pickedIds = new Set(this.clipIds);
    return {
      ...state,
      tracks: state.tracks.map((t) => {
        if (t.id !== this.trackId) return t;
        const remaining = t.clips.filter((c) => !pickedIds.has(c.id));
        const insertAt = Math.min(firstIndex, remaining.length);
        return {
          ...t,
          clips: [...remaining.slice(0, insertAt), compound, ...remaining.slice(insertAt)],
        };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

/** R26.1 — expands a compound back into its children at absolute positions. */
export class UnnestCompoundCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(private readonly clipId: string) {}

  apply(state: TimelineState): TimelineState {
    let homeTrack: Track | null = null;
    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (clip) {
        homeTrack = track;
        if (track.locked) throw new Error(`Track ${track.id} is locked`);
        if (!clip.compound) throw new Error(`Clip ${this.clipId} is not a compound clip`);
        break;
      }
    }
    if (!homeTrack) throw new Error(`Clip with id ${this.clipId} not found`);
    const container = homeTrack.clips.find((c) => c.id === this.clipId)!;
    const spanStart = container.startOffset;
    const children: Clip[] = (container.compound?.clips ?? []).map((c) => ({
      ...c,
      startOffset: addRational(spanStart, c.startOffset),
    }));
    const index = homeTrack.clips.findIndex((c) => c.id === this.clipId);

    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => {
        if (t.id !== homeTrack!.id) return t;
        const clips = [...t.clips];
        clips.splice(index, 1, ...children);
        return { ...t, clips };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}
