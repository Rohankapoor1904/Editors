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
    case 'backspace': // Ripple delete selected clip
      e.preventDefault();
      if (selectedClipIds.length > 0) {
        // Group by track to correctly handle ripple delete per clip?
        // Store rippleDelete requires startTime and duration.
        // It's meant to delete a time range across tracks if we use the RippleDeleteCommand,
        // Wait, RippleDeleteCommand takes startTime and duration and ripples all tracks by that duration.
        // We probably want to just remove the clip and shift following clips on that track, or remove clip and ripple everything.
        // The store currently has rippleDelete(startTime, duration) which creates RippleDeleteCommand.

        // Let's just find the first selected clip, and ripple delete its range.
        const allClips = tracks.flatMap(t => t.clips);
        const selectedClips = allClips.filter(c => selectedClipIds.includes(c.id));
        if (selectedClips.length > 0) {
            // we should issue store.removeClip or rippleDelete.
            // Ripple delete requires start time and duration.
            // A true ripple delete of a selected clip:
            // "Ripple delete selected clip"
            // For now, let's use the clip's startOffset and duration.
            const clip = selectedClips[0];
            rippleDelete(clip.startOffset, clip.duration);
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
