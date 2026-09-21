import { TimelineStore } from '../store/timelineStore';
import { addRational, createRational, compareRational } from '../types/time';
import { transportEngine } from '../engine/transport';

export function handleKeyboardShortcuts(e: KeyboardEvent, store: TimelineStore) {
  // Ignore if typing in an input field
  if (
    document.activeElement instanceof HTMLInputElement ||
    document.activeElement instanceof HTMLTextAreaElement ||
    (document.activeElement as HTMLElement).isContentEditable
  ) {
    return;
  }

  const {
    setPlayheadPosition,
    selectedClipIds,
    removeClip,
    rippleDelete,
    toggleMagneticSnapping,
    tracks,
  } = store;


  switch (e.key.toLowerCase()) {
    case ' ': // Space (Play/Pause)
      e.preventDefault();
      transportEngine.togglePlayback();
      break;
    case 'j': // Shuttle backwards
      // For now, step 5 frames backward or play backward (transportEngine doesn't support play backward yet)
      // We will step back for simplicity
      e.preventDefault();
      transportEngine.pause();
      transportEngine.stepFrame(-5);
      break;
    case 'k': // Pause
      e.preventDefault();
      transportEngine.pause();
      break;
    case 'l': // Shuttle forwards
      e.preventDefault();
      transportEngine.pause();
      transportEngine.stepFrame(5);
      break;
    case 'c':
    case 'b': // Blade tool
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('set-active-tool', { detail: 'blade' }));
      break;
    case 'v': // Select tool
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('set-active-tool', { detail: 'select' }));
      break;
    case 'y': // Slip tool
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('set-active-tool', { detail: 'slip' }));
      break;
    case 'u': // Slide tool
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('set-active-tool', { detail: 'slide' }));
      break;
    case ',': // Insert edit (3-point)
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('timeline-insert-edit'));
      break;
    case '.': // Overwrite edit (3-point)
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('timeline-overwrite-edit'));
      break;
    case 'i': // Mark In
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('timeline-mark-in'));
      break;
    case 'o': // Mark Out
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('timeline-mark-out'));
      break;
    case 's': // Snapping toggle
      e.preventDefault();
      toggleMagneticSnapping();
      break;
    case 'delete':
    case 'backspace':
      e.preventDefault();
      if (selectedClipIds.length > 0) {
        if (e.shiftKey) {
          // Ripple delete: ripples time across sequence
          const allClips = tracks.flatMap(t => t.clips);
          const selectedClips = allClips.filter(c => selectedClipIds.includes(c.id));
          if (selectedClips.length > 0) {
            const clip = selectedClips[0];
            rippleDelete(clip.startOffset, clip.duration);
          }
        } else {
          // Clean Lift delete: removes selected clips without truncating other tracks
          for (const clipId of [...selectedClipIds]) {
            if (typeof removeClip === 'function') {
              removeClip(clipId);
            }
          }
        }
      }
      break;
    case 'arrowleft': // Step 1 frame backward
      e.preventDefault();
      transportEngine.pause();
      transportEngine.stepFrame(-1);
      break;
    case 'arrowright': // Step 1 frame forward
      e.preventDefault();
      transportEngine.pause();
      transportEngine.stepFrame(1);
      break;
    case 'home': // Jump to start
      e.preventDefault();
      setPlayheadPosition(createRational(0, 1));
      break;
    case 'end': { // Jump to end
      e.preventDefault();
      let maxDuration = createRational(0, 1);
      for (const track of tracks) {
        for (const clip of track.clips) {
          const clipEnd = addRational(clip.startOffset, clip.duration);
          if (compareRational(clipEnd, maxDuration) > 0) {
            maxDuration = clipEnd;
          }
        }
      }
      setPlayheadPosition(maxDuration);
      break;
    }
  }
}
