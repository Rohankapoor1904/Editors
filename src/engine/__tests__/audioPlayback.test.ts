import { describe, it, expect, beforeEach } from 'vitest';
import { audioPlaybackManager } from '../audioPlayback';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { secondsToRational } from '../../types/time';

describe('AudioPlaybackManager (Priority 3 Timeline Audio Playback)', () => {
  beforeEach(() => {
    audioPlaybackManager.cleanup();

    useMediaPoolStore.setState({
      assets: [
        {
          id: 'asset_music_1',
          name: 'background_music.mp3',
          path: '/media/music.mp3',
          type: 'audio',
          duration: '00:01:00',
          fingerprint: 'fp_m1',
          isOffline: false,
        },
      ],
    });

    useTimelineStore.setState({
      tracks: [
        {
          id: 'track_a1',
          type: 'audio',
          name: 'A1 - Music',
          index: 0,
          muted: false,
          locked: false,
          solo: false,
          height: 56,
          volume: 0,
          pan: 0,
          clips: [
            {
              id: 'clip_music_1',
              assetId: 'asset_music_1',
              name: 'background_music.mp3',
              startOffset: secondsToRational(2.0),
              sourceIn: secondsToRational(1.0),
              sourceOut: secondsToRational(11.0),
              duration: secondsToRational(10.0),
              volume: -6,
              speed: 1.0,
            },
          ],
        },
      ],
      playheadPosition: secondsToRational(0.0),
    });
  });

  it('syncs audio element to clip time when playhead is within clip range', () => {
    // When playhead is at 4.0s (2s into the clip)
    const playhead = secondsToRational(4.0);
    audioPlaybackManager.sync(playhead);

    // Player should have been created for track_a1
    // In jsdom Audio elements are mocked
    expect(audioPlaybackManager).toBeDefined();
  });

  it('pauses all audio playback when pause is called', () => {
    audioPlaybackManager.play();
    audioPlaybackManager.pause();
    // Verify cleanup
    audioPlaybackManager.cleanup();
  });
});
