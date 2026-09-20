import { describe, it, expect } from 'vitest';
import { useTimelineStore } from '../timelineStore';

describe('TimelineStore', () => {
  it('boots empty or restores the last session without a demo project', () => {
    const state = useTimelineStore.getState();
    expect(state.projectId).not.toBe('proj_demo_01');
    expect(state.projectId).toBe('');

    // Check that there are no clips in the initial state
    const allClips = state.tracks.flatMap(track => track.clips);
    expect(allClips).toHaveLength(0);
  });
});
