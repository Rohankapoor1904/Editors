import { Command } from './index';
import { TimelineState, Track, Clip } from '../../types/timeline';
import { RationalTime, addRational, subRational, compareRational } from '../../types/time';

/**
 * SyncClipsCommand (Task R20.1)
 *
 * Shifts a clip's timeline startOffset to match an audio cross-correlation sync point,
 * preserving media references non-destructively.
 */
export class SyncClipsCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly newStartOffset: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    return {
      ...state,
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === this.clipId
            ? { ...clip, startOffset: this.newStartOffset }
            : clip
        ),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

/**
 * SwitchMultiCamAngleCommand (Task R20.2)
 *
 * Razor-cuts the active multi-cam clip at splitTime and switches the active camera angle
 * for the subsequent clip segment.
 */
export class SwitchMultiCamAngleCommand implements Command {
  private previousState: TimelineState | null = null;
  private newClipId: string | null = null;

  constructor(
    private readonly clipId: string,
    private readonly splitTime: RationalTime,
    private readonly newAngleIndex: number,
    private readonly newAssetId: string,
    private readonly newAngleName: string
  ) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

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

    if (!targetTrack || !targetClip) {
      throw new Error(`Clip with id ${this.clipId} not found for multicam angle switch`);
    }

    const clipStart = targetClip.startOffset;
    const clipEnd = addRational(clipStart, targetClip.duration);

    // If splitTime is within bounds, split and switch angle
    if (compareRational(this.splitTime, clipStart) > 0 && compareRational(this.splitTime, clipEnd) < 0) {
      const duration1 = subRational(this.splitTime, clipStart);
      const duration2 = subRational(clipEnd, this.splitTime);

      const firstSegment: Clip = {
        ...targetClip,
        duration: duration1,
        sourceOut: addRational(targetClip.sourceIn, duration1),
      };

      if (!this.newClipId) {
        this.newClipId = `${targetClip.id}_angle${this.newAngleIndex}_${Date.now()}`;
      }

      const secondSegment: Clip = {
        ...targetClip,
        id: this.newClipId,
        assetId: this.newAssetId,
        name: `${this.newAngleName} (${this.newAngleIndex + 1})`,
        startOffset: this.splitTime,
        sourceIn: addRational(targetClip.sourceIn, duration1),
        sourceOut: targetClip.sourceOut,
        duration: duration2,
      };

      return {
        ...state,
        tracks: state.tracks.map((track) =>
          track.id === targetTrack!.id
            ? {
                ...track,
                clips: track.clips
                  .filter((c) => c.id !== this.clipId)
                  .concat([firstSegment, secondSegment])
                  .sort((a, b) => compareRational(a.startOffset, b.startOffset)),
              }
            : track
        ),
      };
    } else {
      // Switch entire clip angle
      return {
        ...state,
        tracks: state.tracks.map((track) =>
          track.id === targetTrack!.id
            ? {
                ...track,
                clips: track.clips.map((c) =>
                  c.id === this.clipId
                    ? {
                        ...c,
                        assetId: this.newAssetId,
                        name: `${this.newAngleName} (${this.newAngleIndex + 1})`,
                      }
                    : c
                ),
              }
            : track
        ),
      };
    }
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}
