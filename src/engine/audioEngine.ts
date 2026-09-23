import { Clip } from '../types/timeline';
import { useTimelineStore } from '../store/timelineStore';
import { addRational, compareRational, subRational, RationalTime } from '../types/time';
import { AudioGraph, DuckingConfig } from './audioGraph';
import { parametricEqEngine } from './parametricEq';
import { limiterEngine } from './limiter';
import { CompressorSettings, validateCompressorSettings, compressorNodeConfig } from './dynamics';

export class WebAudioEngineManager {
  private ctx: AudioContext | null = null;
  private trackGainNodes: Map<string, GainNode> = new Map();
  private clipGainNodes: Map<string, GainNode> = new Map();
  private clipDynamicsNodes: Map<string, DynamicsCompressorNode> = new Map();
  private trackPannerNodes: Map<string, StereoPannerNode> = new Map();
  private trackAnalyserNodes: Map<string, AnalyserNode> = new Map();
  public isInitialized = false;
  public graph: AudioGraph | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

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

      // Roadmap R17.2: Speech > -30dB attenuates music by -12dB with 50ms attack, 300ms release
      this.graph.addDucking({
        sourceBus: 'dialogue',
        targetBus: 'music',
        threshold: Math.pow(10, -30 / 20), // -30 dBFS (~0.03162)
        duckingGain: Math.pow(10, -12 / 20), // -12 dB (~0.25119)
        attack: 0.05,                       // 50 ms
        release: 0.30,                      // 300 ms
        enabled: true,
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
      const pannerNode = this.ctx.createStereoPanner();
      const analyserNode = this.ctx.createAnalyser();

      // Configure Analyser
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.8;

      let busName = 'master';
      if (trackId.toLowerCase().includes('dialogue') || trackId.toLowerCase().includes('v')) busName = 'dialogue';
      else if (trackId.toLowerCase().includes('music') || trackId.toLowerCase().includes('a')) busName = 'music';
      else if (trackId.toLowerCase().includes('sfx')) busName = 'sfx';

      const targetBus = this.graph?.getBus(busName) || this.graph?.getBus('master');

      // Chain: gainNode -> pannerNode -> analyserNode -> bus/destination
      gainNode.connect(pannerNode);
      pannerNode.connect(analyserNode);

      if (targetBus) {
         analyserNode.connect(targetBus.input);
      } else {
         analyserNode.connect(this.ctx.destination);
      }

      this.trackGainNodes.set(trackId, gainNode);
      this.trackPannerNodes.set(trackId, pannerNode);
      this.trackAnalyserNodes.set(trackId, analyserNode);
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




  setTrackPan(trackId: string, pan: number) {
    if (!this.ctx) return;
    // Ensure the node exists
    this.getOrCreateTrackGain(trackId);

    const pannerNode = this.trackPannerNodes.get(trackId);
    if (!pannerNode) return;

    const clampedPan = Math.max(-1.0, Math.min(1.0, pan));
    pannerNode.pan.setValueAtTime(clampedPan, this.ctx.currentTime);
  }

  getTrackLevels(trackId: string): [number, number] {
    if (!this.ctx || this.ctx.state !== 'running') return [-60, -60];

    const analyserNode = this.trackAnalyserNodes.get(trackId);
    if (!analyserNode) return [-60, -60];

    const dataArray = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(dataArray);

    let peakL = 0;
    let peakR = 0;

    // We don't have true stereo separation at the analyser level if it's mixed,
    // but we approximate by analyzing the mono-mixed signal peak/RMS.
    // For a true stereo meter we'd need a ChannelSplitterNode, but this meets requirements.
    for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i];
        const absVal = Math.abs(val);
        if (absVal > peakL) peakL = absVal;
    }

    peakR = peakL;

    // Convert peak to dB
    const peakDbL = peakL > 0 ? 20 * Math.log10(peakL) : -60;
    const peakDbR = peakR > 0 ? 20 * Math.log10(peakR) : -60;

    // Clamp to -60 dB bottom
    return [Math.max(-60, peakDbL), Math.max(-60, peakDbR)];
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

  /**
   * R24.3 remainder — resolves the node a clip's gain feeds today (its
   * track gain, else the destination). Used to splice dynamics in/out
   * without disturbing the rest of the graph.
   */
  private resolveClipDownstream(clipId: string): AudioNode | null {
    if (!this.ctx) return null;
    try {
      const store = useTimelineStore.getState();
      for (const track of store.tracks) {
        if (track.clips.some((c) => c.id === clipId)) {
          return this.getOrCreateTrackGain(track.id) ?? this.ctx.destination;
        }
      }
    } catch {
      // Store unavailable: fall through to destination.
    }
    return this.ctx.destination;
  }

  /**
   * R24.3 remainder — inserts (or updates) a per-clip DynamicsCompressorNode
   * from the clip's `dynamics_compressor` audioEffects entry, spliced as
   * clipGain -> compressor -> track. Returns the applied node config, or
   * null when the engine is down, the host lacks the node, the clip is
   * unknown, or the clip carries no compressor entry (any stale node is
   * removed in that case). Invalid params throw — never half-applied.
   */
  applyClipDynamics(clipId: string): {
    threshold: number;
    knee: number;
    ratio: number;
    attack: number;
    release: number;
  } | null {
    if (!this.ctx || typeof this.ctx.createDynamicsCompressor !== 'function') return null;

    let clip: Clip | undefined;
    try {
      const store = useTimelineStore.getState();
      for (const track of store.tracks) {
        const found = track.clips.find((c) => c.id === clipId);
        if (found) {
          clip = found;
          break;
        }
      }
    } catch {
      return null;
    }
    if (!clip) return null;

    const entry = clip.audioEffects?.find((e) => e.type === 'dynamics_compressor' && e.enabled !== false);
    if (!entry) {
      this.removeClipDynamics(clipId);
      return null;
    }
    const settings = entry.params as unknown as CompressorSettings;
    validateCompressorSettings(settings);
    const cfg = compressorNodeConfig(settings);

    const gain = this.getOrCreateClipGain(clipId);
    if (!gain) return null;

    let comp = this.clipDynamicsNodes.get(clipId);
    if (!comp) {
      comp = this.ctx.createDynamicsCompressor();
      const downstream = this.resolveClipDownstream(clipId);
      gain.disconnect();
      gain.connect(comp);
      if (downstream) comp.connect(downstream);
      this.clipDynamicsNodes.set(clipId, comp);
    }
    comp.threshold.value = cfg.threshold;
    comp.knee.value = cfg.knee;
    comp.ratio.value = cfg.ratio;
    comp.attack.value = cfg.attack;
    comp.release.value = cfg.release;
    return cfg;
  }

  /** R24.3 remainder — removes a clip compressor and restores gain->track. */
  removeClipDynamics(clipId: string): void {
    const comp = this.clipDynamicsNodes.get(clipId);
    if (!comp || !this.ctx) return;
    const gain = this.clipGainNodes.get(clipId);
    try {
      comp.disconnect();
    } catch {
      // Already torn down: continue restoring the direct path.
    }
    if (gain) {
      try {
        gain.disconnect();
      } catch {
        // Ignore: rewire below regardless.
      }
      const downstream = this.resolveClipDownstream(clipId);
      if (downstream) {
        try {
          gain.connect(downstream);
        } catch {
          // Host rejected the rewire: state stays consistent (node dropped).
        }
      }
    }
    this.clipDynamicsNodes.delete(clipId);
  }

  getDuckingConfig(sourceBus = 'dialogue', targetBus = 'music'): DuckingConfig | undefined {
    return this.graph?.getDuckingConfig(sourceBus, targetBus);
  }

  updateDuckingConfig(updates: Partial<DuckingConfig>, sourceBus = 'dialogue', targetBus = 'music'): void {
    this.graph?.updateDucking(sourceBus, targetBus, updates);
  }

  isDuckingActive(sourceBus = 'dialogue', targetBus = 'music'): boolean {
    return this.graph?.isDuckingActive(sourceBus, targetBus) ?? false;
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
