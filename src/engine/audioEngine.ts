import { Clip } from '../types/timeline';
import { useTimelineStore } from '../store/timelineStore';
import { addRational, compareRational, subRational, RationalTime } from '../types/time';
import { AudioGraph } from './audioGraph';
import { parametricEqEngine } from './parametricEq';
import { limiterEngine } from './limiter';

export class WebAudioEngineManager {
  private ctx: AudioContext | null = null;
  private trackGainNodes: Map<string, GainNode> = new Map();
  private clipGainNodes: Map<string, GainNode> = new Map();
  public isInitialized = false;
  public graph: AudioGraph | null = null;

  init(sampleRate = 48000) {
    if (typeof window === 'undefined') return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      this.ctx = new AudioCtx({ sampleRate });
      this.graph = new AudioGraph(this.ctx);

      const masterBus = this.graph.getBus('master');
      if (masterBus) {
         masterBus.output.disconnect();
         const eqFilters = parametricEqEngine.init(this.ctx);
         const limiterNodes = limiterEngine.init(this.ctx);

         masterBus.output.connect(eqFilters[0]);
         eqFilters[eqFilters.length - 1].connect(limiterNodes.input);
         limiterNodes.output.connect(this.ctx.destination);
      }

      // Ensure default buses exist
      this.graph.createBus('dialogue');
      this.graph.createBus('music');
      this.graph.createBus('sfx');

      this.graph.addDucking({
        sourceBus: 'dialogue',
        targetBus: 'music',
        threshold: 0.05,
        duckingGain: 0.25,
        attack: 0.05,
        release: 0.5
      });
      this.graph.startDuckingProcessor();

      this.isInitialized = true;
      console.log(`[Audio Engine]: WebAudio Sub-frame Graph Initialized at ${sampleRate} Hz`);
    }
  }


  getCurrentTime(): number {
    if (!this.ctx) {
      return typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    }
    return this.ctx.currentTime;
  }

  async resumeContext(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  getOrCreateTrackGain(trackId: string): GainNode | null {
    if (!this.ctx) return null;

    if (!this.trackGainNodes.has(trackId)) {
      const gainNode = this.ctx.createGain();

      let busName = 'master';
      if (trackId.toLowerCase().includes('dialogue') || trackId.toLowerCase().includes('v')) busName = 'dialogue';
      else if (trackId.toLowerCase().includes('music') || trackId.toLowerCase().includes('a')) busName = 'music';
      else if (trackId.toLowerCase().includes('sfx')) busName = 'sfx';

      const targetBus = this.graph?.getBus(busName) || this.graph?.getBus('master');

      if (targetBus) {
         gainNode.connect(targetBus.input);
      } else {
         gainNode.connect(this.ctx.destination);
      }
      this.trackGainNodes.set(trackId, gainNode);
    }
    return this.trackGainNodes.get(trackId) || null;
  }

  getOrCreateClipGain(clipId: string): GainNode | null {
    if (!this.ctx) return null;

    if (!this.clipGainNodes.has(clipId)) {
      const gainNode = this.ctx.createGain();

      // Look up the timeline store to find the track ID this clip belongs to
      let parentTrackId: string | null = null;
      try {
          const store = useTimelineStore.getState();
          for (const track of store.tracks) {
             if (track.clips.some(c => c.id === clipId)) {
                 parentTrackId = track.id;
                 break;
             }
          }
      } catch (e) {
          // If store is not initialized or fails, fallback to destination
      }

      if (parentTrackId) {
          const trackGain = this.getOrCreateTrackGain(parentTrackId);
          if (trackGain) {
              gainNode.connect(trackGain);
          } else {
              gainNode.connect(this.ctx.destination);
          }
      } else {
          gainNode.connect(this.ctx.destination);
      }

      this.clipGainNodes.set(clipId, gainNode);
    }
    return this.clipGainNodes.get(clipId) || null;
  }



  setTrackVolume(trackId: string, volumeDb: number) {
    const gainNode = this.getOrCreateTrackGain(trackId);
    if (!gainNode || !this.ctx) return;

    const linearGain = Math.pow(10, volumeDb / 20);
    gainNode.gain.setValueAtTime(linearGain, this.ctx.currentTime);
  }

  setClipVolume(clipId: string, volumeDb: number) {
    const gainNode = this.getOrCreateClipGain(clipId);
    if (!gainNode || !this.ctx) return;

    const linearGain = Math.pow(10, volumeDb / 20);
    gainNode.gain.setValueAtTime(linearGain, this.ctx.currentTime);
  }

  // Resolves timeline time to context time given the current playback state and base offsets
  // Since context is hardware time, we calculate when in the future the time will occur.



  // Applies a 10ms micro-crossfade between two adjacent clips on a cut seam to avoid clicks.
  applyMicroCrossfade(leftClip: Clip, rightClip: Clip, playbackContextAnchorSec: number, playheadTimeline: RationalTime) {
    const gainNodeLeft = this.getOrCreateClipGain(leftClip.id);
    const gainNodeRight = this.getOrCreateClipGain(rightClip.id);

    if (!gainNodeLeft || !gainNodeRight || !this.ctx) return;

    const leftEnd = addRational(leftClip.startOffset, leftClip.duration);

    // Exact rational time comparison to ensure they are on a cut seam
    const isAdjacent = compareRational(leftEnd, rightClip.startOffset) === 0;

    if (isAdjacent) {
      const seamOffsetTimeline = subRational(leftEnd, playheadTimeline);
      const seamOffsetTimelineSec = seamOffsetTimeline.value / seamOffsetTimeline.rate;

      // Find context-relative offsets
      const seamOffsetContext = seamOffsetTimelineSec + playbackContextAnchorSec;

      const fadeDuration = 0.005; // 5ms fade out, 5ms fade in, total 10ms

      // Only schedule if it's in the future or very close to present
      if (seamOffsetContext + fadeDuration > this.ctx.currentTime) {
         const scheduleStartLeft = Math.max(seamOffsetContext - fadeDuration, this.ctx.currentTime);
         const scheduleStartRight = Math.max(seamOffsetContext, this.ctx.currentTime);

         // Fade out left clip (5ms before seam)
         gainNodeLeft.gain.cancelScheduledValues(scheduleStartLeft);
         gainNodeLeft.gain.setValueAtTime(1.0, scheduleStartLeft);
         gainNodeLeft.gain.linearRampToValueAtTime(0.0, seamOffsetContext);

         // Fade in right clip (5ms after seam)
         gainNodeRight.gain.cancelScheduledValues(scheduleStartRight);
         gainNodeRight.gain.setValueAtTime(0.0, scheduleStartRight);
         gainNodeRight.gain.linearRampToValueAtTime(1.0, seamOffsetContext + fadeDuration);
      }
    }
  }

  applyCrossfade(leftClip: Clip, rightClip: Clip, playbackContextAnchorSec: number, playheadTimeline: RationalTime) {
    const gainNodeLeft = this.getOrCreateClipGain(leftClip.id);
    const gainNodeRight = this.getOrCreateClipGain(rightClip.id);

    if (!gainNodeLeft || !gainNodeRight || !this.ctx) return;

    const leftEnd = addRational(leftClip.startOffset, leftClip.duration);

    if (compareRational(rightClip.startOffset, leftEnd) < 0) {
      // Find context-relative offsets
      // e.g., if rightStart is 10s on timeline, and playhead is at 9s, then rightStart is 1s in the future.
      const overlapStartTimeline = subRational(rightClip.startOffset, playheadTimeline);
      const overlapEndTimeline = subRational(leftEnd, playheadTimeline);

      const overlapStartTimelineSec = overlapStartTimeline.value / overlapStartTimeline.rate;
      const overlapEndTimelineSec = overlapEndTimeline.value / overlapEndTimeline.rate;

      const overlapStartOffsetContext = overlapStartTimelineSec + playbackContextAnchorSec;
      const overlapEndOffsetContext = overlapEndTimelineSec + playbackContextAnchorSec;

      // Only schedule if it's in the future or very close to present
      if (overlapEndOffsetContext > this.ctx.currentTime) {
         const scheduleStart = Math.max(overlapStartOffsetContext, this.ctx.currentTime);

         gainNodeLeft.gain.cancelScheduledValues(scheduleStart);
         gainNodeLeft.gain.setValueAtTime(1.0, scheduleStart);
         gainNodeLeft.gain.linearRampToValueAtTime(0.0, overlapEndOffsetContext);

         gainNodeRight.gain.cancelScheduledValues(scheduleStart);
         gainNodeRight.gain.setValueAtTime(0.0, scheduleStart);
         gainNodeRight.gain.linearRampToValueAtTime(1.0, overlapEndOffsetContext);
      }
    }
  }
}

export const audioEngine = new WebAudioEngineManager();
