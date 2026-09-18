import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleKeyboardShortcuts } from './keyboardShortcuts';
import { transportEngine } from '../engine/transport';
import { createRational, secondsToRational } from '../types/time';

vi.mock('../engine/transport', () => ({
  transportEngine: {
    togglePlayback: vi.fn(),
    pause: vi.fn(),
    stepFrame: vi.fn(),
  }
}));

describe('Keyboard Shortcuts', () => {
  let mockStore: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {
      playheadPosition: secondsToRational(0),
      setPlayheadPosition: vi.fn(),
      selectedClipIds: ['clip_1'],
      rippleDelete: vi.fn(),
      toggleMagneticSnapping: vi.fn(),
      metadata: { fps: 30 },
      tracks: [
        {
          clips: [
            { id: 'clip_1', startOffset: secondsToRational(0), duration: secondsToRational(5) },
            { id: 'clip_2', startOffset: secondsToRational(10), duration: secondsToRational(5) },
          ]
        }
      ]
    };
  });

  it('ignores input when typing', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const e = new KeyboardEvent('keydown', { key: ' ' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(transportEngine.togglePlayback).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('toggles playback on Space', () => {
    const e = new KeyboardEvent('keydown', { key: ' ' });
    e.preventDefault = vi.fn();
    handleKeyboardShortcuts(e, mockStore as any);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(transportEngine.togglePlayback).toHaveBeenCalled();
  });

  it('steps frame backward on ArrowLeft', () => {
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(transportEngine.stepFrame).toHaveBeenCalledWith(-1);
    expect(transportEngine.pause).toHaveBeenCalled();
  });

  it('steps frame forward on ArrowRight', () => {
    const e = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(transportEngine.stepFrame).toHaveBeenCalledWith(1);
    expect(transportEngine.pause).toHaveBeenCalled();
  });

  it('shuttles backward on j', () => {
    const e = new KeyboardEvent('keydown', { key: 'j' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(transportEngine.stepFrame).toHaveBeenCalledWith(-5);
  });

  it('pauses on k', () => {
    const e = new KeyboardEvent('keydown', { key: 'k' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(transportEngine.pause).toHaveBeenCalled();
  });

  it('shuttles forward on l', () => {
    const e = new KeyboardEvent('keydown', { key: 'l' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(transportEngine.stepFrame).toHaveBeenCalledWith(5);
  });

  it('dispatches active tool blade on c', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const e = new KeyboardEvent('keydown', { key: 'c' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('set-active-tool');
    expect(event.detail).toBe('blade');
  });

  it('dispatches active tool blade on b', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const e = new KeyboardEvent('keydown', { key: 'b' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('set-active-tool');
    expect(event.detail).toBe('blade');
  });

  it('dispatches active tool select on v', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const e = new KeyboardEvent('keydown', { key: 'v' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('set-active-tool');
    expect(event.detail).toBe('select');
  });

  it('toggles snapping on s', () => {
    const e = new KeyboardEvent('keydown', { key: 's' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(mockStore.toggleMagneticSnapping).toHaveBeenCalled();
  });

  it('ripple deletes on Delete', () => {
    const e = new KeyboardEvent('keydown', { key: 'Delete' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(mockStore.rippleDelete).toHaveBeenCalledWith(secondsToRational(0), secondsToRational(5));
  });

  it('ripple deletes on Backspace', () => {
    const e = new KeyboardEvent('keydown', { key: 'Backspace' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(mockStore.rippleDelete).toHaveBeenCalledWith(secondsToRational(0), secondsToRational(5));
  });

  it('jumps to start on Home', () => {
    const e = new KeyboardEvent('keydown', { key: 'Home' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(mockStore.setPlayheadPosition).toHaveBeenCalledWith(createRational(0, 1));
  });

  it('jumps to end on End', () => {
    const e = new KeyboardEvent('keydown', { key: 'End' });
    handleKeyboardShortcuts(e, mockStore as any);
    expect(mockStore.setPlayheadPosition).toHaveBeenCalledWith(secondsToRational(15));
  });
});
