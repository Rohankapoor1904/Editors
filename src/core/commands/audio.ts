import { Command } from './index';
import { TimelineState, Clip, AudioRole, Effect } from '../../types/timeline';
import { RationalTime } from '../../types/time';
import { validateRole } from '../../engine/essentialSound';

export class ApplyClipGainCommand implements Command {
  private previousState: TimelineState | null = null;
  private modifiedClips: Record<string, number | undefined> = {};

  constructor(private clipId: string, private volumeDb: number) {}

  apply(state: TimelineState): TimelineState {
    this.previousState = state;

    // Efficiently save previous volume to optimize inversion
    for (const track of state.tracks) {
      const clip = track.clips.find(c => c.id === this.clipId);
      if (clip) {
        this.modifiedClips[this.clipId] = clip.volume;
        break;
      }
    }

    return {
      ...state,
      tracks: state.tracks.map(t => {
        if (!t.clips.some(c => c.id === this.clipId)) return t;
        return {
          ...t,
          clips: t.clips.map(c => c.id === this.clipId ? { ...c, volume: this.volumeDb } : c)
        }
      })
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;

    return {
      ...state,
      tracks: state.tracks.map(t => {
        if (!t.clips.some(c => c.id === this.clipId)) return t;
        return {
          ...t,
          clips: t.clips.map(c => {
             if (c.id === this.clipId) {
                const prevVolume = this.modifiedClips[this.clipId];
                if (prevVolume !== undefined) {
                    return { ...c, volume: prevVolume };
                } else {
                    const { volume: _volume, ...rest } = c; // Ignored destructuring of volume
                    return rest as Clip;
                }
             }
             return c;
          })
        };
      })
    };
  }
}

export class ApplyCrossfadeCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
      private leftClipId: string,
      private rightClipId: string,
      private duration: RationalTime
  ) {}

  apply(state: TimelineState): TimelineState {
      this.previousState = state;

      let leftClipFound = false;
      let rightClipFound = false;

      // Ensure both clips exist
      for (const track of state.tracks) {
          if (track.clips.some(c => c.id === this.leftClipId)) leftClipFound = true;
          if (track.clips.some(c => c.id === this.rightClipId)) rightClipFound = true;
      }

      if (!leftClipFound || !rightClipFound) {
          throw new Error("One or both clips not found");
      }

      return {
          ...state,
          tracks: state.tracks.map(t => {
              const hasLeft = t.clips.some(c => c.id === this.leftClipId);
              const hasRight = t.clips.some(c => c.id === this.rightClipId);
              if (!hasLeft && !hasRight) return t;

              return {
                  ...t,
                  clips: t.clips.map(c => {
                      if (c.id === this.rightClipId) {
                          let leftClip: Clip | undefined;
                          for (const track of state.tracks) {
                              const found = track.clips.find(clip => clip.id === this.leftClipId);
                              if (found) leftClip = found;
                          }
                          if (!leftClip) return c;

                          return {
                              ...c,
                              audioEffects: [...(c.audioEffects || []), {
                                  id: `xfade_${crypto.randomUUID()}`,
                                  type: 'crossfade',
                                  enabled: true,
                                  params: { leftClipId: this.leftClipId, duration: this.duration }
                              }]
                          };
                      }
                      return c;
                  })
              };
          })
      };
  }

    invert(state: TimelineState): TimelineState {
       return this.previousState || state;
    }
}

/** R24.3 — tags a clip with an Essential Sound role (undoable). */
export class SetClipAudioRoleCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly role: AudioRole
  ) {
    validateRole(role);
  }

  apply(state: TimelineState): TimelineState {
    let foundTrack: boolean = false;
    for (const track of state.tracks) {
      const clip = track.clips.find((c) => c.id === this.clipId);
      if (clip) {
        foundTrack = true;
        if (track.locked) {
          throw new Error(`Track ${track.id} is locked`);
        }
        break;
      }
    }
    if (!foundTrack) {
      throw new Error(`Clip with id ${this.clipId} not found`);
    }
    this.previousState = state;
    return {
      ...state,
      tracks: state.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === this.clipId ? { ...c, audioRole: this.role } : c)),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}

/**
 * R24.3 — creates or patches one entry in a clip's audioEffects chain
 * (compressor / de-esser params ride here into the audio path).
 */
export class UpsertClipAudioEffectCommand implements Command {
  private previousState: TimelineState | null = null;

  constructor(
    private readonly clipId: string,
    private readonly effectId: string,
    private readonly effectType: string,
    private readonly params: Record<string, unknown>
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
          const chain: Effect[] = [...(c.audioEffects ?? [])];
          const idx = chain.findIndex((e) => e.id === this.effectId);
          const entry: Effect = { id: this.effectId, type: this.effectType, enabled: true, params: this.params };
          if (idx >= 0) chain[idx] = { ...chain[idx], ...entry };
          else chain.push(entry);
          return { ...c, audioEffects: chain };
        }),
      })),
    };
  }

  invert(state: TimelineState): TimelineState {
    if (!this.previousState) return state;
    return this.previousState;
  }
}
