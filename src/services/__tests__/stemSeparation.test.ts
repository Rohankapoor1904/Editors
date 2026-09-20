import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTimelineStore } from '../../store/timelineStore';
import { nativeBridge } from '../nativeBridge';
import { secondsToRational } from '../../types/time';
import { Clip } from '../../types/timeline';

describe('AI Stem Separation & Voice Isolation Wiring (R17.1 & R17.3)', () => {
  beforeEach(() => {
    // Reset store
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track_a1',
          type: 'audio',
          index: 0,
          name: 'A1 - Dialogue Track',
          muted: false,
          locked: false,
          solo: false,
          height: 56,
          clips: [],
        },
        {
          id: 'track_a2',
          type: 'audio',
          index: 1,
          name: 'A2 - Background Music (Auto-Ducked)',
          muted: false,
          locked: false,
          solo: false,
          height: 56,
          clips: [],
        },
      ],
      past: [],
      future: [],
    });
  });

  it('separates an audio clip into discrete Vocals and Instrumental tracks', async () => {
    // Mock nativeBridge.separateAudioStems
    const separateSpy = vi.spyOn(nativeBridge, 'separateAudioStems').mockResolvedValue({
      vocalsPath: '/media/interview_vocals.wav',
      instrumentalPath: '/media/interview_instrumental.wav',
    });

    const testClip: Clip = {
      id: 'clip_source_1',
      assetId: '/media/interview.mp4',
      name: 'Interview Master',
      startOffset: secondsToRational(2.0),
      duration: secondsToRational(5.0),
      sourceIn: secondsToRational(0.0),
      sourceOut: secondsToRational(5.0),
      volume: 0,
    };

    useTimelineStore.getState().addClipToTrack('track_a1', testClip);

    const result = await useTimelineStore.getState().separateClipStems('clip_source_1');

    expect(separateSpy).toHaveBeenCalledWith('/media/interview.mp4');
    expect(result).not.toBeNull();
    expect(result?.vocalClipId).toBeDefined();
    expect(result?.instrumentalClipId).toBeDefined();

    const state = useTimelineStore.getState();
    const dialogueTrack = state.tracks.find(t => t.id === 'track_a1');
    const musicTrack = state.tracks.find(t => t.id === 'track_a2');

    // Dialogue track has vocal clip
    const vocalClip = dialogueTrack?.clips.find(c => c.id === result?.vocalClipId);
    expect(vocalClip).toBeDefined();
    expect(vocalClip?.name).toBe('Interview Master (Vocals)');
    expect(vocalClip?.assetId).toBe('/media/interview_vocals.wav');
    expect(vocalClip?.startOffset.value).toBe(testClip.startOffset.value);
    expect(vocalClip?.duration.value).toBe(testClip.duration.value);

    // Music track has instrumental clip
    const instClip = musicTrack?.clips.find(c => c.id === result?.instrumentalClipId);
    expect(instClip).toBeDefined();
    expect(instClip?.name).toBe('Interview Master (Instrumental)');
    expect(instClip?.assetId).toBe('/media/interview_instrumental.wav');
    expect(instClip?.startOffset.value).toBe(testClip.startOffset.value);
    expect(instClip?.duration.value).toBe(testClip.duration.value);
  });

  it('applies voice isolation effect with measured SNR improvement', async () => {
    const denoiseSpy = vi.spyOn(nativeBridge, 'denoiseAudioFile').mockResolvedValue({
      outputPath: '/media/interview_isolated.wav',
      snrImprovementDb: 14.8,
    });

    const testClip: Clip = {
      id: 'clip_noisy_1',
      assetId: '/media/noisy_speech.wav',
      name: 'Noisy Interview',
      startOffset: secondsToRational(0.0),
      duration: secondsToRational(4.0),
      sourceIn: secondsToRational(0.0),
      sourceOut: secondsToRational(4.0),
    };

    useTimelineStore.getState().addClipToTrack('track_a1', testClip);

    const result = await useTimelineStore.getState().applyNoiseIsolation('clip_noisy_1', 0.8, true);

    expect(denoiseSpy).toHaveBeenCalledWith('/media/noisy_speech.wav', 0.8, true);
    expect(result?.snrImprovementDb).toBe(14.8);
    expect(result?.outputPath).toBe('/media/interview_isolated.wav');

    const clip = useTimelineStore.getState().tracks[0].clips.find(c => c.id === 'clip_noisy_1');
    const effect = clip?.effects?.find(e => e.id === 'fx_voice_isolation');
    expect(effect).toBeDefined();
    expect(effect?.type).toBe('voice_isolation');
    expect(effect?.params.snrImprovementDb).toBe(14.8);
  });
});
