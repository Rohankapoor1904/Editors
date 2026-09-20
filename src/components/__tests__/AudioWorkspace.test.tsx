import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AudioWorkspace } from '../AudioWorkspace';
import { useTimelineStore } from '../../store/timelineStore';

vi.mock('../../engine/audioEngine', () => ({
  audioEngine: {
    isInitialized: false,
    graph: null,
    setTrackVolume: vi.fn(),
    setTrackPan: vi.fn(),
    getTrackLevels: vi.fn(() => [-60, -60]),
  },
}));

vi.mock('../../store/timelineStore', () => ({
  useTimelineStore: vi.fn(),
}));

describe('AudioWorkspace', () => {
  it('renders audio tracks faders', () => {
    (useTimelineStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: 'track_a1', type: 'audio', name: 'Dialogue' },
      { id: 'track_a2', type: 'audio', name: 'Music' },
      { id: 'track_v1', type: 'video', name: 'Video' }
    ]);

    render(<AudioWorkspace />);

    // Should render two track faders (ignoring video)
    expect(screen.getByTestId('track-fader-track_a1')).toBeDefined();
    expect(screen.getByTestId('track-fader-track_a2')).toBeDefined();
    expect(screen.queryByTestId('track-fader-track_v1')).toBeNull();

    // Should render the LUFS meter text
    expect(screen.getByText(/LUFS/i)).toBeDefined();
    expect(screen.getAllByText('DISABLED').length).toBeGreaterThan(0);
  });
});
