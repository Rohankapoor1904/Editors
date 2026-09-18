import { useTimelineStore } from '../store/timelineStore';
import { secondsToRational, createRational, addRational, subRational, compareRational, RationalTime } from '../types/time';
import { audioEngine } from './audioEngine';

export type TransportStateListener = (isPlaying: boolean) => void;

export class TransportEngine {
  private requestRef: number | null = null;
  private playbackStartTimeSec: number = 0;
  private playbackStartPlayhead: RationalTime = createRational(0, 1);
  private isPlaying: boolean = false;
  public isLooping: boolean = false;
  private listeners: Set<TransportStateListener> = new Set();
  private cachedDuration: RationalTime | null = null;

  public subscribe(listener: TransportStateListener): () => void {
    this.listeners.add(listener);
    listener(this.isPlaying);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.isPlaying));
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;

    // Invalidate cached duration so we recompute once on play
    this.cachedDuration = null;

    // If we're at the end of the sequence, play should restart from 0
    const store = useTimelineStore.getState();
    const duration = this.getTimelineDuration();
    if (compareRational(store.playheadPosition, duration) >= 0 && compareRational(duration, createRational(0, 1)) > 0) {
        store.setPlayheadPosition(createRational(0, 1));
    }

    this.playbackStartPlayhead = useTimelineStore.getState().playheadPosition;

    // Resume audio context in case it's suspended (e.g. autoplay policy)
    audioEngine.resumeContext().catch(e => console.error('Failed to resume audio context', e));

    this.playbackStartTimeSec = audioEngine.getCurrentTime();
    this.applyAudioCrossfades();

    this.requestRef = requestAnimationFrame(() => this.loop());
    this.notifyListeners();
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.requestRef !== null) {
      cancelAnimationFrame(this.requestRef);
      this.requestRef = null;
    }

    // Perform final sync to store
    this.updatePlayheadPosition(audioEngine.getCurrentTime());

    this.notifyListeners();
  }

  public togglePlayback() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public setLoop(looping: boolean) {
    this.isLooping = looping;
  }

  public toggleLoop() {
    this.isLooping = !this.isLooping;
  }

  public stepFrame(deltaFrames: number) {
    const store = useTimelineStore.getState();
    const metadata = store.metadata;
    const isDropFrame = !Number.isInteger(metadata.fps);
    const num = isDropFrame ? 1001 : 1;
    const den = isDropFrame ? Math.round(metadata.fps * 1001) : Math.round(metadata.fps);

    const delta = createRational(deltaFrames * num, den);
    const newPos = addRational(store.playheadPosition, delta);
    const zero = createRational(0, den);

    const targetPos = compareRational(newPos, zero) < 0 ? zero : newPos;
    store.setPlayheadPosition(targetPos);

    // If playing, we need to reset the anchor time so playback continues correctly from new pos
    if (this.isPlaying) {
      this.playbackStartPlayhead = targetPos;
      this.playbackStartTimeSec = audioEngine.getCurrentTime();
    }
  }

  private getTimelineDuration(): RationalTime {
    if (this.cachedDuration !== null) {
       return this.cachedDuration;
    }

    const store = useTimelineStore.getState();
    const metadata = store.metadata;
    let maxDuration = secondsToRational(0, Math.round(metadata.fps * 1000));

    for (const track of store.tracks) {
      for (const clip of track.clips) {
        const clipEnd = addRational(clip.startOffset, clip.duration);
        if (compareRational(clipEnd, maxDuration) > 0) {
          maxDuration = clipEnd;
        }
      }
    }

    this.cachedDuration = maxDuration;
    return maxDuration;
  }

  public invalidateDurationCache() {
      this.cachedDuration = null;
  }

  private updatePlayheadPosition(currentTimeSec: number) {
    const store = useTimelineStore.getState();
    const duration = this.getTimelineDuration();

    const elapsedSec = currentTimeSec - this.playbackStartTimeSec;
    // Base 60000 rate is a good lowest common multiple for sequence timing
    const elapsedRational = secondsToRational(elapsedSec, 60000);
    let newPos = addRational(this.playbackStartPlayhead, elapsedRational);

    if (compareRational(duration, createRational(0, 1)) > 0) {
      if (compareRational(newPos, duration) >= 0) {
        if (this.isLooping) {
          // Calculate loop remainder without drift
          const remainder = subRational(newPos, duration);
          newPos = remainder;

          // Re-anchor to prevent float wrapping drift and ensure seamless loop
          this.playbackStartTimeSec = currentTimeSec;
          this.playbackStartPlayhead = newPos;
        } else {
          // Pause at end
          newPos = duration;
          store.setPlayheadPosition(newPos);
          this.pause();
          return;
        }
      }
    }

    store.setPlayheadPosition(newPos);
  }


  private applyAudioCrossfades() {
    const store = useTimelineStore.getState();
    const playheadTimelineSec = store.playheadPosition.value / store.playheadPosition.rate;

    for (const track of store.tracks) {
      if (track.type !== 'audio' && track.type !== 'video') continue;
      if (track.muted || track.locked) continue;

      // Sort clips by start time
      const sortedClips = [...track.clips].sort((a, b) =>
        (a.startOffset.value / a.startOffset.rate) - (b.startOffset.value / b.startOffset.rate)
      );

      for (let i = 0; i < sortedClips.length - 1; i++) {
        const leftClip = sortedClips[i];
        const rightClip = sortedClips[i + 1];

        audioEngine.applyMicroCrossfade(leftClip, rightClip, this.playbackStartTimeSec, playheadTimelineSec);
      }
    }
  }

  private loop() {
    if (!this.isPlaying) return;

    this.updatePlayheadPosition(audioEngine.getCurrentTime());
    if (this.isPlaying) {
      this.requestRef = requestAnimationFrame(() => this.loop());
    }
  }
}

export const transportEngine = new TransportEngine();
