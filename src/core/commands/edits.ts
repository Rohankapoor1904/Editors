import { Command } from './index';
import { TimelineState, Track, Clip, Transform } from '../../types/timeline';
import { RationalTime, addRational, subRational, compareRational, createRational } from '../../types/time';

export class SplitCommand implements Command {
  private previousState: TimelineState | null = null;
  private splitId: string | null = null;

  constructor(
    private readonly clipId: string,
    private readonly splitTime: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    let targetTrack: Track | undefined;
    let targetClip: Clip | undefined;

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        targetTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }

    const clipStart = targetClip.startOffset;
    const clipEnd = addRational(clipStart, targetClip.duration);

    if (compareRational(this.splitTime, clipStart) <= 0 || compareRational(this.splitTime, clipEnd) >= 0) {
      throw new Error(`Split time is outside the bounds of the clip`);
    }

    const duration1 = subRational(this.splitTime, clipStart);
    const duration2 = subRational(clipEnd, this.splitTime);

    const clip1: Clip = {
      ...targetClip,
      duration: duration1,
      sourceOut: addRational(targetClip.sourceIn, duration1),
    };

    if (!this.splitId) {
      this.splitId = `${targetClip.id}_split_${Date.now()}`;
    }

    const clip2: Clip = {
      ...targetClip,
      id: this.splitId,
      startOffset: this.splitTime,
      sourceIn: addRational(targetClip.sourceIn, duration1),
      duration: duration2,
    };

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id !== targetTrack!.id) return track;
        const index = track.clips.findIndex(c => c.id === this.clipId);
        const newClips = [...track.clips];
        newClips.splice(index, 1, clip1, clip2);
        return { ...track, clips: newClips };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class SlipCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly delta: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    let targetTrack: Track | undefined;
    let targetClip: Clip | undefined;

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        targetTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }

    const newSourceIn = addRational(targetClip.sourceIn, this.delta);
    const newSourceOut = addRational(targetClip.sourceOut, this.delta);

    // In a real system, we'd check if newSourceIn < 0 or if newSourceOut > asset duration.
    // For now, we allow it (or we could enforce newSourceIn >= 0).
    if (compareRational(newSourceIn, createRational(0, 1)) < 0) {
      throw new Error(`Slip results in negative sourceIn`);
    }

    const updatedClip: Clip = {
      ...targetClip,
      sourceIn: newSourceIn,
      sourceOut: newSourceOut
    };

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id !== targetTrack!.id) return track;
        const newClips = track.clips.map(c => c.id === this.clipId ? updatedClip : c);
        return { ...track, clips: newClips };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class SlideCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly delta: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    let targetTrack: Track | undefined;
    let targetClip: Clip | undefined;

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        targetTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }

    const newStartOffset = addRational(targetClip.startOffset, this.delta);

    if (compareRational(newStartOffset, createRational(0, 1)) < 0) {
      throw new Error(`Slide results in negative startOffset`);
    }

    const updatedClip: Clip = {
      ...targetClip,
      startOffset: newStartOffset
    };

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id !== targetTrack!.id) return track;
        const newClips = track.clips.map(c => c.id === this.clipId ? updatedClip : c);
        return { ...track, clips: newClips };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class MoveCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly newStartOffset: RationalTime,
    private readonly newTrackId?: string
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    let sourceTrack: Track | undefined;
    let targetClip: Clip | undefined;

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        sourceTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (!sourceTrack || !targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }

    const destinationTrackId = this.newTrackId || sourceTrack.id;
    const destTrack = state.tracks.find(t => t.id === destinationTrackId);

    if (!destTrack) {
      throw new Error(`Target track ${destinationTrackId} not found`);
    }

    if (destTrack.locked) {
      throw new Error(`Target track ${destinationTrackId} is locked`);
    }

    const updatedClip: Clip = {
      ...targetClip,
      startOffset: this.newStartOffset
    };

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id === sourceTrack!.id && track.id === destinationTrackId) {
          // Moving within the same track
          const newClips = track.clips.map(c => c.id === this.clipId ? updatedClip : c);
          return { ...track, clips: newClips };
        } else if (track.id === sourceTrack!.id) {
          // Removing from source track
          return { ...track, clips: track.clips.filter(c => c.id !== this.clipId) };
        } else if (track.id === destinationTrackId) {
          // Adding to destination track
          return { ...track, clips: [...track.clips, updatedClip] };
        }
        return track;
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class OverwriteCommand implements Command {
  private previousState: TimelineState | null = null;
  private generatedIds: Record<string, string> = {};

  constructor(
    private readonly trackId: string,
    private readonly clip: Clip
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    const targetTrack = state.tracks.find(t => t.id === this.trackId);

    if (!targetTrack) {
      throw new Error(`Track ${this.trackId} not found`);
    }

    if (targetTrack.locked) {
      throw new Error(`Track ${this.trackId} is locked`);
    }

    const overwriteStart = this.clip.startOffset;
    const overwriteEnd = addRational(overwriteStart, this.clip.duration);

    const newClips: Clip[] = [];

    for (const c of targetTrack.clips) {
      const clipStart = c.startOffset;
      const clipEnd = addRational(clipStart, c.duration);

      if (compareRational(clipEnd, overwriteStart) <= 0 || compareRational(clipStart, overwriteEnd) >= 0) {
        newClips.push(c);
      } else {
        const overlapsStart = compareRational(clipStart, overwriteStart) < 0;
        const overlapsEnd = compareRational(clipEnd, overwriteEnd) > 0;

        if (overlapsStart && overlapsEnd) {
          const duration1 = subRational(overwriteStart, clipStart);
          const duration2 = subRational(clipEnd, overwriteEnd);

          newClips.push({
            ...c,
            duration: duration1,
            sourceOut: addRational(c.sourceIn, duration1)
          });

          if (!this.generatedIds[c.id]) {
            this.generatedIds[c.id] = `${c.id}_split_${Date.now()}`;
          }
          newClips.push({
            ...c,
            id: this.generatedIds[c.id],
            startOffset: overwriteEnd,
            sourceIn: subRational(c.sourceOut, duration2),
            duration: duration2
          });
        } else if (overlapsStart) {
          const newDuration = subRational(overwriteStart, clipStart);
          if (compareRational(newDuration, createRational(0, 1)) > 0) {
            newClips.push({
              ...c,
              duration: newDuration,
              sourceOut: addRational(c.sourceIn, newDuration)
            });
          }
        } else if (overlapsEnd) {
          const newDuration = subRational(clipEnd, overwriteEnd);
          if (compareRational(newDuration, createRational(0, 1)) > 0) {
            newClips.push({
              ...c,
              startOffset: overwriteEnd,
              sourceIn: subRational(c.sourceOut, newDuration),
              duration: newDuration
            });
          }
        }
      }
    }

    newClips.push(this.clip);

    return {
      ...state,
      tracks: state.tracks.map(t => t.id === this.trackId ? { ...t, clips: newClips } : t)
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class RippleDeleteCommand implements Command {
  private previousState: TimelineState | null = null;
  private generatedIds: Record<string, string> = {};

  constructor(
    private readonly startTime: RationalTime,
    private readonly duration: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    const deleteEnd = addRational(this.startTime, this.duration);

    return {
      ...state,
      tracks: state.tracks.map((track) => {
        if (track.locked) return track;

        const newClips: Clip[] = [];

        for (const c of track.clips) {
          const clipStart = c.startOffset;
          const clipEnd = addRational(clipStart, c.duration);

          // Completely before the delete region
          if (compareRational(clipEnd, this.startTime) <= 0) {
            newClips.push(c);
          }
          // Completely after the delete region
          else if (compareRational(clipStart, deleteEnd) >= 0) {
            newClips.push({
              ...c,
              startOffset: subRational(clipStart, this.duration)
            });
          }
          // Partially overlaps or is contained within
          else {
            const overlapsStart = compareRational(clipStart, this.startTime) < 0;
            const overlapsEnd = compareRational(clipEnd, deleteEnd) > 0;

            if (overlapsStart && overlapsEnd) {
              // The delete region splits the clip into two
              const duration1 = subRational(this.startTime, clipStart);
              const duration2 = subRational(clipEnd, deleteEnd);

              newClips.push({
                ...c,
                duration: duration1,
                sourceOut: addRational(c.sourceIn, duration1)
              });

              // The second part shifts left by the deleted duration
              const newStartOffset = subRational(deleteEnd, this.duration);
              if (!this.generatedIds[c.id]) {
                this.generatedIds[c.id] = `${c.id}_split_${Date.now()}`;
              }
              newClips.push({
                ...c,
                id: this.generatedIds[c.id],
                startOffset: newStartOffset, // which is this.startTime
                sourceIn: subRational(c.sourceOut, duration2),
                duration: duration2
              });
            } else if (overlapsStart) {
              // Trim the end
              const newDuration = subRational(this.startTime, clipStart);
              if (compareRational(newDuration, createRational(0, 1)) > 0) {
                newClips.push({
                  ...c,
                  duration: newDuration,
                  sourceOut: addRational(c.sourceIn, newDuration)
                });
              }
            } else if (overlapsEnd) {
              // Trim the start and shift
              const newDuration = subRational(clipEnd, deleteEnd);
              if (compareRational(newDuration, createRational(0, 1)) > 0) {
                newClips.push({
                  ...c,
                  startOffset: this.startTime, // Shifted left by the duration of the delete region
                  sourceIn: subRational(c.sourceOut, newDuration),
                  duration: newDuration
                });
              }
            }
            // If it's completely contained, it's removed (not added to newClips)
          }
        }

        return { ...track, clips: newClips };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class TrimCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly edge: 'in' | 'out',
    private readonly delta: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    let targetTrack: Track | undefined;
    let targetClip: Clip | undefined;

    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        targetTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }

    let newDuration: RationalTime;
    let newSourceIn = targetClip.sourceIn;
    let newSourceOut = targetClip.sourceOut;
    let newStartOffset = targetClip.startOffset;

    if (this.edge === 'in') {
      newDuration = subRational(targetClip.duration, this.delta);
      newSourceIn = addRational(targetClip.sourceIn, this.delta);
      newStartOffset = addRational(targetClip.startOffset, this.delta);
    } else {
      newDuration = addRational(targetClip.duration, this.delta);
      newSourceOut = addRational(targetClip.sourceOut, this.delta);
    }

    if (compareRational(newDuration, createRational(0, 1)) <= 0) {
      throw new Error(`Trim results in zero or negative length clip`);
    }

    const updatedClip: Clip = {
      ...targetClip,
      duration: newDuration,
      sourceIn: newSourceIn,
      sourceOut: newSourceOut,
      startOffset: newStartOffset
    };

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id !== targetTrack!.id) return track;
        const newClips = track.clips.map(c => c.id === this.clipId ? updatedClip : c);
        return { ...track, clips: newClips };
      }),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}


export class ToggleClipMuteCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(private readonly clipId: string) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    let targetClip: Clip | undefined;
    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        targetClip = clip;
        break;
      }
    }

    if (!targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }

    return {
      ...state,
      tracks: state.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.id === this.clipId ? { ...clip, muted: !clip.muted } : clip
        )
      }))
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class UpdateTransformCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly newTransform: Transform
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let found = false;

    const newTracks = state.tracks.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id === this.clipId) {
          found = true;
          return {
            ...clip,
            transform: { ...clip.transform, ...this.newTransform }
          };
        }
        return clip;
      })
    }));

    if (!found) {
      throw new Error(`Clip with id ${this.clipId} not found for transform update`);
    }

    return {
      ...state,
      tracks: newTracks
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}
