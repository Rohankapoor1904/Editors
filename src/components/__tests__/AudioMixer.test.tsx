import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AudioMixer } from '../AudioMixer';
import { audioEngine } from '../../engine/audioEngine';

const mockToggleTrackState = vi.fn();

vi.mock('../../store/timelineStore', () => {
  return {
    useTimelineStore: (selector: any) => {
      const state = {
        tracks: [
          { id: 'track_a1', type: 'audio', name: 'A1 - Dialogue Track', muted: false, solo: false },
          { id: 'track_v1', type: 'video', name: 'V1 - Main Video', muted: false, solo: false }
        ],
        toggleTrackState: mockToggleTrackState,
      };
      if (typeof selector === 'function') {
        return selector(state);
      }
      return state;
    }
  };
});

// Mock the audio engine
vi.mock('../../engine/audioEngine', () => ({
  audioEngine: {
    setTrackVolume: vi.fn(),
    setTrackPan: vi.fn(),
    getTrackLevels: vi.fn().mockReturnValue([-60, -60]),
  },
}));

describe('AudioMixer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToggleTrackState.mockClear();

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('renders correctly with only audio tracks', () => {
    render(<AudioMixer />);
    expect(screen.getByText('Track Mixer')).toBeDefined();
    expect(screen.getByText('A1 - Dialogue Track')).toBeDefined();
    expect(screen.queryByText('V1 - Main Video')).toBeNull();
  });

  it('updates volume via audioEngine when fader is moved', () => {
    render(<AudioMixer />);

    const volumeSlider = screen.getAllByRole('slider').find(el => el.getAttribute('min') === '-48');
    expect(volumeSlider).toBeDefined();

    fireEvent.change(volumeSlider!, { target: { value: '-10' } });
    expect(audioEngine.setTrackVolume).toHaveBeenCalledWith('track_a1', -10);
  });

  it('updates pan via audioEngine when pan knob is moved', () => {
    render(<AudioMixer />);

    const panSlider = screen.getAllByRole('slider').find(el => el.getAttribute('min') === '-1');
    expect(panSlider).toBeDefined();

    fireEvent.change(panSlider!, { target: { value: '0.5' } });
    expect(audioEngine.setTrackPan).toHaveBeenCalledWith('track_a1', 0.5);
  });

  it('calls toggleTrackState when mute and solo are clicked', () => {
    render(<AudioMixer />);

    const muteButton = screen.getAllByTitle('Mute')[0];
    fireEvent.click(muteButton);
    expect(mockToggleTrackState).toHaveBeenCalledWith('track_a1', 'muted');

    const soloButton = screen.getAllByTitle('Solo')[0];
    fireEvent.click(soloButton);
    expect(mockToggleTrackState).toHaveBeenCalledWith('track_a1', 'solo');
  });

  it('polls getTrackLevels', () => {
    let callback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb) => {
      callback = cb;
      return 1;
    }));

    render(<AudioMixer />);
    expect(callback).toBeDefined();
    if (callback) {
      act(() => {
        (callback as FrameRequestCallback)(performance.now());
      });
    }

    expect(audioEngine.getTrackLevels).toHaveBeenCalledWith('track_a1');
  });
});