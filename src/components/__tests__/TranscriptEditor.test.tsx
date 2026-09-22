import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TranscriptEditor } from '../TranscriptEditor';
import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { whisperService } from '../../services/whisperTranscriber';
import { secondsToRational } from '../../types/time';

describe('TranscriptEditor Descript-Style Editing (Task R13.3)', () => {
  beforeEach(() => {
    useTimelineStore.setState({
      tracks: [
        {
          id: 'track_v1',
          type: 'video',
          name: 'V1',
          index: 0,
          muted: false,
          locked: false,
          solo: false,
          height: 60,
          clips: [
            {
              id: 'clip_01',
              assetId: 'asset_01',
              name: 'Interview.mp4',
              startOffset: secondsToRational(0),
              sourceIn: secondsToRational(0),
              sourceOut: secondsToRational(10),
              duration: secondsToRational(10),
            },
          ],
        },
      ],
      selectedClipIds: ['clip_01'],
      playheadPosition: secondsToRational(0),
    });

    useMediaPoolStore.setState({
      assets: [
        {
          id: 'asset_01',
          name: 'Interview.mp4',
          path: '/path/to/interview.mp4',
          type: 'video',
          duration: '00:00:10',
          resolution: '1920x1080',
          fps: '30',
          fingerprint: 'fp_01',
          isOffline: false,
        },
      ],
    });
  });

  it('transcribes the active clip and allows shift-range selection and delete ripple edit', async () => {
    vi.spyOn(whisperService, 'transcribe').mockResolvedValueOnce({
      fullText: 'Hello world welcome to cinecraft',
      words: [
        { id: 'w1', word: 'Hello', startTime: 0.5, endTime: 1.0, confidence: 0.95 },
        { id: 'w2', word: 'world', startTime: 1.1, endTime: 1.6, confidence: 0.92 },
        { id: 'w3', word: 'welcome', startTime: 2.5, endTime: 3.0, confidence: 0.88 },
        { id: 'w4', word: 'to', startTime: 3.1, endTime: 3.4, confidence: 0.96 },
        { id: 'w5', word: 'cinecraft', startTime: 3.5, endTime: 4.2, confidence: 0.99 },
      ],
    });

    const rippleSpy = vi.spyOn(useTimelineStore.getState(), 'rippleDelete');

    render(<TranscriptEditor />);

    // R11.7+: transcription is user-initiated (button), not on mount.
    fireEvent.click(screen.getByText('Generate Transcript'));

    // Wait for words to mount
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeDefined();
      expect(screen.getByText('cinecraft')).toBeDefined();
    });

    // Verify silence gap chip detected between 'world' (1.6s) and 'welcome' (2.5s) -> 0.9s gap
    expect(screen.getByText(/\[0.9s\]/)).toBeDefined();

    // Click 'Hello'
    fireEvent.click(screen.getByText('Hello'));
    expect(screen.getByText(/Delete Selection \(1\)/)).toBeDefined();

    // Shift-click 'world' to range-select [Hello, world]
    fireEvent.click(screen.getByText('world'), { shiftKey: true });
    expect(screen.getByText(/Delete Selection \(2\)/)).toBeDefined();

    // Trigger delete via Backspace key
    fireEvent.keyDown(window, { key: 'Backspace' });

    // Assert rippleDelete was executed
    expect(rippleSpy).toHaveBeenCalled();
  });
});
