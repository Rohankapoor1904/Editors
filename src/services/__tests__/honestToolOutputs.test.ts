import { describe, it, expect, beforeEach } from 'vitest';
import { globalToolRegistry } from '../tools/registry';
import { resolveAssetAudioPath } from '../tools/timelineTools';
import {
  getCaptionWordsForClip,
  mapTranscriptToCaptionWords,
} from '../../engine/captions/clipCaptions';
import { getRuntimeMode, setRuntimeMode, NotImplementedError } from '../runtimeConfig';
import { useMediaPoolStore } from '../../store/mediaPool';
import { useTimelineStore } from '../../store/timelineStore';
import { secondsToRational } from '../../types/time';

describe('R21.3: no fabricated AI outputs on the tool path', () => {
  beforeEach(() => {
    setRuntimeMode('live');
    useMediaPoolStore.setState({ assets: [], selectedAssetId: null });
    useTimelineStore.setState({ past: [], future: [], tracks: [], selectedClipIds: [] });
  });

  it('transcribe_and_align never returns the old hardcoded fixture', async () => {
    const result: any = await globalToolRegistry.execute('transcribe_and_align', {
      asset_id: 'ghost_asset',
    });
    expect(result).toHaveProperty('error');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('Welcome');
    expect(serialized).not.toContain('CineCraft');
  });

  it('detect_silence never returns the old hardcoded windows', async () => {
    const result: any = await globalToolRegistry.execute('detect_silence', {
      asset_id: 'ghost_asset',
    });
    expect(result).toHaveProperty('error');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('3.2');
    expect(serialized).not.toContain('8.5');
  });

  it('timeline_remove_silence never applies the old hardcoded gap', async () => {
    const result: any = await globalToolRegistry.execute('timeline_remove_silence', {
      threshold_seconds: 0.5,
    });
    expect(result).toHaveProperty('error');
    expect(JSON.stringify(result)).not.toContain('2.5');
  });

  it('resolveAssetAudioPath resolves pool assets and rejects ghosts', () => {
    useMediaPoolStore.setState({
      assets: [
        {
          id: 'a1',
          name: 'Voice.wav',
          path: '/media/Voice.wav',
          type: 'audio',
          duration: '00:00:20',
          fingerprint: 'fp-a1',
          isOffline: false,
        },
      ],
      selectedAssetId: null,
    });
    expect(resolveAssetAudioPath('a1')).toBe('/media/Voice.wav');
    expect(resolveAssetAudioPath('Voice.wav')).toBe('/media/Voice.wav');
    expect(resolveAssetAudioPath('ghost_asset')).toBeNull();
  });

  it('mapTranscriptToCaptionWords binds source timestamps onto the clip range', () => {
    const clip: any = {
      id: 'clip1',
      sourceIn: secondsToRational(2, 30),
      startOffset: secondsToRational(10, 30),
      duration: secondsToRational(5, 30),
    };
    const words = mapTranscriptToCaptionWords(
      [
        { word: 'hello', startTime: 2.5, endTime: 3.0 },
        { word: 'before', startTime: 0.0, endTime: 1.0 },
        { word: 'after', startTime: 50.0, endTime: 51.0 },
      ],
      clip
    );
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe('hello');
    expect(words[0].startTime).toBeCloseTo(10.5, 6);
    expect(words[0].endTime).toBeCloseTo(11.0, 6);
  });

  it('getCaptionWordsForClip throws in live mode instead of inventing words', () => {
    const clip: any = {
      id: 'clip1',
      duration: secondsToRational(10, 30),
      startOffset: secondsToRational(0, 30),
    };
    expect(() => getCaptionWordsForClip(clip)).toThrow(NotImplementedError);
  });

  it('getCaptionWordsForClip stays available for demo-mode previews only', () => {
    setRuntimeMode('demo');
    if (getRuntimeMode() !== 'demo') {
      // Demo mode is DEV-gated; outside dev the live-mode throw above is the
      // whole contract, so there is nothing further to assert here.
      return;
    }
    try {
      const clip: any = {
        id: 'clip1',
        duration: secondsToRational(40, 30),
        startOffset: secondsToRational(0, 30),
      };
      const words = getCaptionWordsForClip(clip);
      expect(words.length).toBeGreaterThan(0);
    } finally {
      setRuntimeMode('live');
    }
  });
});
