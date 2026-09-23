import { Command } from './index';
import { TimelineState, Track, Clip, Transform, Keyframe, SpeedRampConfig } from '../../types/timeline';
import { RationalTime, addRational, subRational, compareRational, createRational } from '../../types/time';
import { calculateDurationForSpeed, calculateTimelineDurationForEnvelope } from '../../engine/speedRamp';

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
    private readonly delta: RationalTime,
    private readonly maxSourceDuration?: RationalTime
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

    if (targetTrack.locked) {
      throw new Error(`Track ${targetTrack.id} is locked`);
    }

    let actualDelta = this.delta;
    let newSourceIn = addRational(targetClip.sourceIn, actualDelta);
    let newSourceOut = addRational(targetClip.sourceOut, actualDelta);

    // Boundary check 1: sourceIn cannot be negative
    if (compareRational(newSourceIn, createRational(0, 1)) < 0) {
      actualDelta = subRational(createRational(0, 1), targetClip.sourceIn);
      newSourceIn = createRational(0, 1);
      newSourceOut = addRational(newSourceIn, targetClip.duration);
    }

    // Boundary check 2: sourceOut cannot exceed maxSourceDuration (if supplied)
    if (this.maxSourceDuration && compareRational(newSourceOut, this.maxSourceDuration) > 0) {
      newSourceOut = this.maxSourceDuration;
      newSourceIn = subRational(newSourceOut, targetClip.duration);
      if (compareRational(newSourceIn, createRational(0, 1)) < 0) {
        newSourceIn = createRational(0, 1);
      }
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

    if (targetTrack.locked) {
      throw new Error(`Track ${targetTrack.id} is locked`);
    }

    const newStartOffset = addRational(targetClip.startOffset, this.delta);

    if (compareRational(newStartOffset, createRational(0, 1)) < 0) {
      throw new Error(`Slide results in negative startOffset`);
    }

    // Sort clips on the track by startOffset to locate immediate neighbors
    const sortedClips = [...targetTrack.clips].sort((a, b) =>
      compareRational(a.startOffset, b.startOffset)
    );
    const clipIndex = sortedClips.findIndex(c => c.id === this.clipId);

    const prevClip = clipIndex > 0 ? sortedClips[clipIndex - 1] : undefined;
    const nextClip = clipIndex < sortedClips.length - 1 ? sortedClips[clipIndex + 1] : undefined;

    // Target clip moves by delta; its duration and source offsets remain constant
    const updatedTargetClip: Clip = {
      ...targetClip,
      startOffset: newStartOffset
    };

    let updatedPrevClip: Clip | undefined;
    let updatedNextClip: Clip | undefined;

    // Adjust abutting preceding clip (tail trim/extend)
    if (prevClip) {
      const prevEnd = addRational(prevClip.startOffset, prevClip.duration);
      if (compareRational(prevEnd, targetClip.startOffset) === 0) {
        const newPrevDuration = addRational(prevClip.duration, this.delta);
        if (compareRational(newPrevDuration, createRational(0, 1)) <= 0) {
          throw new Error(`Slide would collapse preceding clip`);
        }
        updatedPrevClip = {
          ...prevClip,
          duration: newPrevDuration,
          sourceOut: addRational(prevClip.sourceOut, this.delta)
        };
      }
    }

    // Adjust abutting following clip (head trim/extend)
    if (nextClip) {
      const targetEnd = addRational(targetClip.startOffset, targetClip.duration);
      if (compareRational(nextClip.startOffset, targetEnd) === 0) {
        const newNextStart = addRational(nextClip.startOffset, this.delta);
        const newNextDuration = subRational(nextClip.duration, this.delta);
        const newNextSourceIn = addRational(nextClip.sourceIn, this.delta);

        if (compareRational(newNextDuration, createRational(0, 1)) <= 0) {
          throw new Error(`Slide would collapse following clip`);
        }
        if (compareRational(newNextSourceIn, createRational(0, 1)) < 0) {
          throw new Error(`Slide would make following clip sourceIn negative`);
        }

        updatedNextClip = {
          ...nextClip,
          startOffset: newNextStart,
          duration: newNextDuration,
          sourceIn: newNextSourceIn
        };
      }
    }

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id !== targetTrack!.id) return track;
        const newClips = track.clips.map(c => {
          if (c.id === this.clipId) return updatedTargetClip;
          if (updatedPrevClip && c.id === updatedPrevClip.id) return updatedPrevClip;
          if (updatedNextClip && c.id === updatedNextClip.id) return updatedNextClip;
          return c;
        });
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
      playheadPosition: overwriteEnd,
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

export class InsertCommand implements Command {
  private previousState: TimelineState | null = null;
  private generatedIds: Record<string, string> = {};

  constructor(
    private readonly trackId: string,
    private readonly clip: Clip,
    private readonly rippleAllTracks: boolean = false
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

    const insertTime = this.clip.startOffset;
    const insertDuration = this.clip.duration;
    const insertEnd = addRational(insertTime, insertDuration);

    const updatedTracks = state.tracks.map((track) => {
      // If not rippling all tracks, only modify the target track
      if (!this.rippleAllTracks && track.id !== this.trackId) {
        return track;
      }
      if (track.locked) {
        return track;
      }

      const newClips: Clip[] = [];

      for (const c of track.clips) {
        const clipStart = c.startOffset;
        const clipEnd = addRational(clipStart, c.duration);

        if (compareRational(clipEnd, insertTime) <= 0) {
          // Entirely before insert point -> untouched
          newClips.push(c);
        } else if (compareRational(clipStart, insertTime) >= 0) {
          // Entirely at or after insert point -> push downstream by insertDuration
          newClips.push({
            ...c,
            startOffset: addRational(clipStart, insertDuration)
          });
        } else {
          // Straddles insert point -> split into two parts
          const duration1 = subRational(insertTime, clipStart);
          const duration2 = subRational(clipEnd, insertTime);

          // Part 1: before insert point
          newClips.push({
            ...c,
            duration: duration1,
            sourceOut: addRational(c.sourceIn, duration1)
          });

          // Part 2: after inserted clip
          if (!this.generatedIds[c.id]) {
            this.generatedIds[c.id] = `${c.id}_split_${Date.now()}`;
          }
          newClips.push({
            ...c,
            id: this.generatedIds[c.id],
            startOffset: insertEnd,
            sourceIn: addRational(c.sourceIn, duration1),
            duration: duration2
          });
        }
      }

      // Add the inserted clip if this is the target track
      if (track.id === this.trackId) {
        newClips.push(this.clip);
      }

      // Sort clips by startOffset for determinism
      newClips.sort((a, b) => compareRational(a.startOffset, b.startOffset));

      return { ...track, clips: newClips };
    });

    return {
      ...state,
      playheadPosition: insertEnd,
      tracks: updatedTracks
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class SplitTrimCommand implements Command {
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

    if (targetTrack.locked) {
      throw new Error(`Track ${targetTrack.id} is locked`);
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
      throw new Error(`Split trim results in zero or negative length clip`);
    }

    // Find companion clip if linked
    let companionClip: Clip | undefined;
    let companionTrack: Track | undefined;
    if (targetClip.linkedClipId) {
      for (const t of state.tracks) {
        const c = t.clips.find(item => item.id === targetClip!.linkedClipId);
        if (c) {
          companionClip = c;
          companionTrack = t;
          break;
        }
      }
    }

    let syncOffset: RationalTime | undefined;
    let splitTrimType: 'j-cut' | 'l-cut' | 'none' = 'none';

    if (companionClip) {
      const isAudio = targetTrack.type === 'audio';
      const audioStart = isAudio ? newStartOffset : companionClip.startOffset;
      const videoStart = isAudio ? companionClip.startOffset : newStartOffset;

      const diff = subRational(audioStart, videoStart);
      syncOffset = diff;

      // J-Cut: audio leads video (audio starts before video)
      if (compareRational(audioStart, videoStart) < 0) {
        splitTrimType = 'j-cut';
      } else if (compareRational(audioStart, videoStart) > 0) {
        splitTrimType = 'l-cut';
      } else {
        const audioEnd = addRational(audioStart, isAudio ? newDuration : companionClip.duration);
        const videoEnd = addRational(videoStart, isAudio ? companionClip.duration : newDuration);
        if (compareRational(audioEnd, videoEnd) > 0) {
          splitTrimType = 'l-cut';
        } else if (compareRational(videoEnd, audioEnd) > 0) {
          splitTrimType = 'j-cut';
        }
      }
    }

    const updatedTargetClip: Clip = {
      ...targetClip,
      duration: newDuration,
      sourceIn: newSourceIn,
      sourceOut: newSourceOut,
      startOffset: newStartOffset,
      syncOffset,
      splitTrimType
    };

    const updatedCompanionClip: Clip | undefined = companionClip
      ? {
          ...companionClip,
          syncOffset,
          splitTrimType
        }
      : undefined;

    return {
      ...state,
      tracks: state.tracks.map(track => {
        if (track.id === targetTrack!.id) {
          return {
            ...track,
            clips: track.clips.map(c => c.id === this.clipId ? updatedTargetClip : c)
          };
        }
        if (companionTrack && track.id === companionTrack.id && updatedCompanionClip) {
          return {
            ...track,
            clips: track.clips.map(c => c.id === updatedCompanionClip.id ? updatedCompanionClip : c)
          };
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

export class RealignSyncCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(private readonly clipId: string) {}

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

    if (!targetTrack || !targetClip || !targetClip.linkedClipId) {
      return state;
    }

    let companionClip: Clip | undefined;
    let companionTrack: Track | undefined;

    for (const t of state.tracks) {
      const c = t.clips.find(item => item.id === targetClip!.linkedClipId);
      if (c) {
        companionClip = c;
        companionTrack = t;
        break;
      }
    }

    if (!companionClip || !companionTrack) {
      return state;
    }

    // Anchor video, re-align audio to match video startOffset and duration
    const videoClip = targetTrack.type === 'video' ? targetClip : companionClip;
    const audioClip = targetTrack.type === 'audio' ? targetClip : companionClip;

    const realignedAudio: Clip = {
      ...audioClip,
      startOffset: videoClip.startOffset,
      sourceIn: videoClip.sourceIn,
      sourceOut: videoClip.sourceOut,
      duration: videoClip.duration,
      syncOffset: undefined,
      splitTrimType: 'none'
    };

    const realignedVideo: Clip = {
      ...videoClip,
      syncOffset: undefined,
      splitTrimType: 'none'
    };

    return {
      ...state,
      tracks: state.tracks.map(t => {
        if (t.clips.some(c => c.id === realignedVideo.id)) {
          return {
            ...t,
            clips: t.clips.map(c => c.id === realignedVideo.id ? realignedVideo : c)
          };
        }
        if (t.clips.some(c => c.id === realignedAudio.id)) {
          return {
            ...t,
            clips: t.clips.map(c => c.id === realignedAudio.id ? realignedAudio : c)
          };
        }
        return t;
      })
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

export class UpdateClipVolumeCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly volumeDb: number
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let found = false;

    const newTracks = state.tracks.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id === this.clipId) {
          found = true;
          return { ...clip, volume: this.volumeDb };
        }
        return clip;
      })
    }));

    if (!found) {
      throw new Error(`Clip with id ${this.clipId} not found for volume update`);
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

export class UpdateClipEffectCommand implements Command {
  private previousState: TimelineState | null = null;
  public coalesceKey?: string;

  constructor(
    private readonly clipId: string,
    private readonly effectId: string,
    private readonly effectType: string,
    private readonly newParams: Record<string, unknown>
  ) {
    this.coalesceKey = `UpdateClipEffectCommand_${clipId}_${effectId}`;
  }

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let foundClip = false;

    const newTracks = state.tracks.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id === this.clipId) {
          foundClip = true;
          const currentEffects = clip.effects || [];
          const effectIndex = currentEffects.findIndex(e => e.id === this.effectId);

          let newEffects;
          if (effectIndex >= 0) {
            newEffects = [...currentEffects];
            newEffects[effectIndex] = {
              ...newEffects[effectIndex],
              params: {
                ...newEffects[effectIndex].params,
                ...this.newParams
              }
            };
          } else {
            newEffects = [...currentEffects, {
              id: this.effectId,
              type: this.effectType,
              enabled: true,
              params: this.newParams
            }];
          }

          return {
            ...clip,
            effects: newEffects
          };
        }
        return clip;
      })
    }));

    if (!foundClip) {
      throw new Error(`Clip with id ${this.clipId} not found for effect update`);
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

/**
 * R25.5 — toggles an effect entry's enabled flag (undoable). Throws when
 * the clip or effect id is unknown instead of silently succeeding.
 */
export class ToggleClipEffectCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly effectId: string
  ) {}

  apply(state: TimelineState): TimelineState {
    let found = false;
    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (clip) {
        found = true;
        if (track.locked) {
          throw new Error(`Track ${track.id} is locked`);
        }
        if (!(clip.effects ?? []).some((e) => e.id === this.effectId)) {
          throw new Error(`Effect with id ${this.effectId} not found on clip ${this.clipId}`);
        }
        break;
      }
    }
    if (!found) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== this.clipId) return c;
          return {
            ...c,
            effects: (c.effects ?? []).map((e) =>
              e.id === this.effectId ? { ...e, enabled: !e.enabled } : e
            ),
          };
        }),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

export class SetKeyframeCommand implements Command {
  private previousState: TimelineState | null = null;
  readonly coalesceKey?: string;

  constructor(
    private readonly clipId: string,
    private readonly property: string,
    private readonly keyframe: Keyframe
  ) {
    this.coalesceKey = `SetKeyframeCommand_${clipId}_${property}_${keyframe.time.value}_${keyframe.time.rate}`;
  }

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let foundClip = false;

    const newTracks = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id === this.clipId) {
          foundClip = true;
          const currentKeyframes = clip.keyframes?.[this.property] ? [...clip.keyframes[this.property]] : [];
          const existingIndex = currentKeyframes.findIndex((k) => compareRational(k.time, this.keyframe.time) === 0);

          if (existingIndex >= 0) {
            currentKeyframes[existingIndex] = this.keyframe;
          } else {
            currentKeyframes.push(this.keyframe);
          }

          currentKeyframes.sort((a, b) => compareRational(a.time, b.time));

          return {
            ...clip,
            keyframes: {
              ...(clip.keyframes || {}),
              [this.property]: currentKeyframes,
            },
          };
        }
        return clip;
      }),
    }));

    if (!foundClip) {
      throw new Error(`Clip with id ${this.clipId} not found for keyframe update`);
    }

    return {
      ...state,
      tracks: newTracks,
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

export class RemoveKeyframeCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly property: string,
    private readonly time: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let foundClip = false;

    const newTracks = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id === this.clipId) {
          foundClip = true;
          const currentKeyframes = clip.keyframes?.[this.property] ? [...clip.keyframes[this.property]] : [];
          const filtered = currentKeyframes.filter((k) => compareRational(k.time, this.time) !== 0);

          return {
            ...clip,
            keyframes: {
              ...(clip.keyframes || {}),
              [this.property]: filtered,
            },
          };
        }
        return clip;
      }),
    }));

    if (!foundClip) {
      throw new Error(`Clip with id ${this.clipId} not found for keyframe removal`);
    }

    return {
      ...state,
      tracks: newTracks,
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

export class ApplySpeedRampCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly speedConfig: SpeedRampConfig
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let foundClip = false;

    const newTracks = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id === this.clipId) {
          foundClip = true;
          const sourceDuration = subRational(clip.sourceOut, clip.sourceIn);

          let newDuration: RationalTime;
          if (this.speedConfig.envelope && this.speedConfig.envelope.length > 0) {
            newDuration = calculateTimelineDurationForEnvelope(sourceDuration, this.speedConfig.envelope);
          } else if (this.speedConfig.constantSpeed !== undefined) {
            newDuration = calculateDurationForSpeed(sourceDuration, this.speedConfig.constantSpeed);
          } else {
            newDuration = sourceDuration;
          }

          return {
            ...clip,
            duration: newDuration,
            speed: this.speedConfig.constantSpeed ?? 1.0,
            speedRamp: this.speedConfig,
            reverse: !!this.speedConfig.reverse,
          };
        }
        return clip;
      }),
    }));

    if (!foundClip) {
      throw new Error(`Clip with id ${this.clipId} not found for speed ramp application`);
    }

    return {
      ...state,
      tracks: newTracks,
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

export class ApplyAutoReframeCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly transform: Transform,
    private readonly keyframes: Record<string, Keyframe[]>
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    let foundClip = false;

    const newTracks = state.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (clip.id === this.clipId) {
          foundClip = true;
          return {
            ...clip,
            transform: { ...clip.transform, ...this.transform },
            keyframes: { ...clip.keyframes, ...this.keyframes },
          };
        }
        return clip;
      }),
    }));

    if (!foundClip) {
      throw new Error(`Clip with id ${this.clipId} not found for auto-reframe application`);
    }

    return {
      ...state,
      tracks: newTracks,
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}


