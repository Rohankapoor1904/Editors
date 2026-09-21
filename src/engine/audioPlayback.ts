import { useTimelineStore } from '../store/timelineStore';
import { useMediaPoolStore } from '../store/mediaPool';
import { rationalToSeconds, subRational, compareRational, addRational, RationalTime } from '../types/time';
import { audioEngine } from './audioEngine';
import { mapTimelineToSourceTime, getInstantaneousPlaybackRate } from './speedRamp';
import { nativeBridge } from '../services/nativeBridge';
import { SpeedRampConfig } from '../types/timeline';

interface TrackPlayer {
  audio: HTMLAudioElement;
  sourceNode?: MediaElementAudioSourceNode;
  activeClipId: string | null;
}

export class AudioPlaybackManager {
  private players: Map<string, TrackPlayer> = new Map();
  private isPlaying = false;

  private getOrCreatePlayer(trackId: string): TrackPlayer | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;

    let player = this.players.get(trackId);
    if (!player) {
      const audio = new Audio();
      audio.preload = 'auto';
      player = { audio, activeClipId: null };
      this.players.set(trackId, player);
    }

    // Try routing through WebAudio graph if context is available
    if (!player.sourceNode && audioEngine.context) {
      try {
        const source = audioEngine.context.createMediaElementSource(player.audio);
        const trackGain = audioEngine.getOrCreateTrackGain(trackId);
        if (trackGain) {
          source.connect(trackGain);
        } else {
          source.connect(audioEngine.context.destination);
        }
        player.sourceNode = source;
      } catch (err) {
        // May fail if already connected or in test mock environment
        console.debug('[AudioPlaybackManager] MediaElementSource setup note:', err);
      }
    }

    return player;
  }

  public sync(playheadPosition: RationalTime) {
    if (typeof window === 'undefined') return;

    const { tracks } = useTimelineStore.getState();
    const { assets } = useMediaPoolStore.getState();

    const audioTracks = tracks.filter((t) => t.type === 'audio');

    for (const track of audioTracks) {
      const player = this.getOrCreatePlayer(track.id);
      if (!player) continue;

      if (track.muted || track.locked) {
        if (!player.audio.paused) player.audio.pause();
        continue;
      }

      // Find active clip on this track at current playhead
      const activeClip = track.clips.find(
        (c) =>
          compareRational(playheadPosition, c.startOffset) >= 0 &&
          compareRational(playheadPosition, addRational(c.startOffset, c.duration)) < 0
      );

      if (activeClip) {
        const asset = assets.find((a) => a.id === activeClip.assetId);
        const assetPath = asset?.path || activeClip.assetId;
        const resolvedSrc = assetPath ? nativeBridge.getAssetUrl(assetPath) : '';

        if (resolvedSrc && player.audio.src !== resolvedSrc) {
          player.audio.src = resolvedSrc;
          player.activeClipId = activeClip.id;
        }

        const offsetInClip = subRational(playheadPosition, activeClip.startOffset);
        const sourceDuration = subRational(activeClip.sourceOut, activeClip.sourceIn);
        const config: SpeedRampConfig = {
          ...(activeClip.speedRamp ?? {}),
          constantSpeed: activeClip.speedRamp?.constantSpeed ?? activeClip.speed ?? 1.0,
          reverse: activeClip.reverse ?? activeClip.speedRamp?.reverse ?? false,
        };

        const sourceTimeRational = mapTimelineToSourceTime(
          offsetInClip,
          activeClip.sourceIn,
          sourceDuration,
          config
        );
        const sourceTime = rationalToSeconds(sourceTimeRational);

        // Sync volume from clip if defined
        if (typeof activeClip.volume === 'number') {
          const linearGain = Math.max(0, Math.min(1, Math.pow(10, activeClip.volume / 20)));
          player.audio.volume = linearGain;
        }

        const rate = getInstantaneousPlaybackRate(offsetInClip, config);
        if (rate > 0 && player.audio.playbackRate !== rate) {
          player.audio.playbackRate = Math.max(0.1, Math.min(16.0, rate));
        }

        const timeDiff = Math.abs(player.audio.currentTime - sourceTime);
        if (!this.isPlaying || timeDiff > 0.25) {
          try {
            player.audio.currentTime = sourceTime;
          } catch {
            // Media not yet loaded
          }
        }

        if (this.isPlaying && player.audio.paused) {
          player.audio.play().catch((err) => {
            console.debug('[AudioPlaybackManager] Audio play pending interaction:', err);
          });
        }
      } else {
        if (!player.audio.paused) {
          player.audio.pause();
        }
        player.activeClipId = null;
      }
    }
  }

  public play() {
    this.isPlaying = true;
    const playhead = useTimelineStore.getState().playheadPosition;
    this.sync(playhead);
  }

  public pause() {
    this.isPlaying = false;
    this.players.forEach((player) => {
      if (!player.audio.paused) {
        player.audio.pause();
      }
    });
  }

  public cleanup() {
    this.pause();
    this.players.forEach((player) => {
      player.audio.src = '';
    });
    this.players.clear();
  }
}

export const audioPlaybackManager = new AudioPlaybackManager();
