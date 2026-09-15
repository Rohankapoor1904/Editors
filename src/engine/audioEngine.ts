export class WebAudioEngineManager {
  private ctx: AudioContext | null = null;
  private trackGainNodes: Map<string, GainNode> = new Map();
  public isInitialized = false;

  init(sampleRate = 48000) {
    if (typeof window === 'undefined') return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      this.ctx = new AudioCtx({ sampleRate });
      this.isInitialized = true;
      console.log(`[Audio Engine]: WebAudio Sub-frame Graph Initialized at ${sampleRate} Hz`);
    }
  }

  getOrCreateTrackGain(trackId: string): GainNode | null {
    if (!this.ctx) return null;

    if (!this.trackGainNodes.has(trackId)) {
      const gainNode = this.ctx.createGain();
      gainNode.connect(this.ctx.destination);
      this.trackGainNodes.set(trackId, gainNode);
    }
    return this.trackGainNodes.get(trackId) || null;
  }

  /**
   * Applies exponential audio ducking DSP on background music track
   */
  applyAudioDucking(musicTrackId: string, dialogueActive: boolean) {
    const gainNode = this.getOrCreateTrackGain(musicTrackId);
    if (!gainNode || !this.ctx) return;

    const targetGain = dialogueActive ? 0.25 : 1.0; // Attenuate by -12dB when speech active
    const now = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setTargetAtTime(targetGain, now, 0.05); // 50ms attack/release time
  }

  setTrackVolume(trackId: string, volumeDb: number) {
    const gainNode = this.getOrCreateTrackGain(trackId);
    if (!gainNode || !this.ctx) return;

    // Convert dB to linear gain: gain = 10^(dB / 20)
    const linearGain = Math.pow(10, volumeDb / 20);
    gainNode.gain.setValueAtTime(linearGain, this.ctx.currentTime);
  }
}

export const audioEngine = new WebAudioEngineManager();
