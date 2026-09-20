import { Command } from './index';
import { TimelineState, Track, Clip } from '../../types/timeline';
import { RationalTime, addRational, subRational, compareRational } from '../../types/time';

export class AddTrackCommand implements Command {
  private readonly newTrack: Track;

  constructor(type: Track['type'], name: string, index: number) {
    this.newTrack = {
      id: `track_${type}_${Date.now()}`,
      type,
      index,
      name,
      muted: false,
      locked: false,
      solo: false,
      height: type === 'video' ? 64 : 56,
      clips: [],
    };
  }

  apply(state: TimelineState): TimelineState {
    return { ...state, tracks: [...state.tracks, this.newTrack] };
  }

  invert(state: TimelineState): TimelineState {
    return { ...state, tracks: state.tracks.filter(t => t.id !== this.newTrack.id) };
  }
}

export class AddClipCommand implements Command {
  constructor(private readonly trackId: string, private readonly clip: Clip) {}

  apply(state: TimelineState): TimelineState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? { ...track, clips: [...track.clips, this.clip] }
          : track
      ),
    };
  }

  invert(state: TimelineState): TimelineState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? { ...track, clips: track.clips.filter((c) => c.id !== this.clip.id) }
          : track
      ),
    };
  }
}

export class RemoveClipCommand implements Command {
  private previousTrackId: string | null = null;
  private previousClip: Clip | null = null;
  private previousSelection: string[] = [];

  constructor(private readonly clipId: string) {}

  apply(state: TimelineState): TimelineState {
    let targetTrack: Track | undefined;
    let targetClip: Clip | undefined;

    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (clip) {
        targetTrack = track;
        targetClip = clip;
        break;
      }
    }

    if (targetTrack && targetClip) {
      this.previousTrackId = targetTrack.id;
      this.previousClip = targetClip;
    }

    this.previousSelection = state.selectedClipIds;

    return {
      ...state,
      selectedClipIds: state.selectedClipIds.filter((id) => id !== this.clipId),
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== this.clipId),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousTrackId || !this.previousClip) {
      return state;
    }

    const trackId = this.previousTrackId;
    const clip = this.previousClip;

    return {
      ...state,
      selectedClipIds: this.previousSelection,
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? { ...track, clips: [...track.clips, clip] }
          : track
      ),
    };
  }
}

export class RippleDeleteCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly startTime: RationalTime,
    private readonly duration: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips
          .filter(
            (c) =>
              !(
                compareRational(c.startOffset, this.startTime) >= 0 &&
                compareRational(addRational(c.startOffset, c.duration), addRational(this.startTime, this.duration)) <= 0
              )
          )
          .map((c) => {
            if (compareRational(c.startOffset, addRational(this.startTime, this.duration)) >= 0) {
              return { ...c, startOffset: subRational(c.startOffset, this.duration) };
            }
            return c;
          }),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) {
      return state;
    }
    return this.previousState;
  }
}

export class ToggleTrackStateCommand implements Command {
  constructor(
    private readonly trackId: string,
    private readonly property: 'muted' | 'locked' | 'solo'
  ) {}

  apply(state: TimelineState): TimelineState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? { ...track, [this.property]: !track[this.property] }
          : track
      ),
    };
  }

  invert(state: TimelineState): TimelineState {
    return {
      ...state,
      tracks: state.tracks.map((track) =>
        track.id === this.trackId
          ? { ...track, [this.property]: !track[this.property] }
          : track
      ),
    };
  }
}

export class SetMetadataCommand implements Command {
  private previousMetadata: TimelineState['metadata'] | null = null;

  constructor(private readonly newMetadata: Partial<TimelineState['metadata']>) {}

  apply(state: TimelineState): TimelineState {
    this.previousMetadata = { ...state.metadata };
    return {
      ...state,
      metadata: {
        ...state.metadata,
        ...this.newMetadata,
      },
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousMetadata) {
      return state;
    }
    return {
      ...state,
      metadata: this.previousMetadata,
    };
  }
}

