import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { TitlesPanel } from '../TitlesPanel';
import { AIPromptConsole } from '../AIPromptConsole';
import { useTimelineStore } from '../../store/timelineStore';
import { useAgentStore } from '../../store/agentStore';
import { createRational } from '../../types/time';
import { clearCustomTitleTemplates } from '../../engine/titles';

function seedVideoStore() {
  useTimelineStore.setState({
    past: [],
    future: [],
    tracks: [
      {
        id: 'v1',
        type: 'video',
        index: 0,
        name: 'V1',
        muted: false,
        locked: false,
        solo: false,
        height: 64,
        clips: [],
      },
    ],
    selectedClipIds: [],
    playheadPosition: createRational(5, 1),
  });
  useAgentStore.setState({
    isConnected: false,
    activeModel: 'test-model',
    currentTask: null,
    taskHistory: [],
    actionDiffs: [],
    isProcessing: false,
  });
}

function trackClips() {
  return useTimelineStore.getState().tracks[0].clips;
}

describe('R24.4 — TitlesPanel', () => {
  afterEach(() => {
    cleanup();
    clearCustomTitleTemplates();
  });

  it('adds a template title at the playhead and edits its text in place', () => {
    clearCustomTitleTemplates();
    seedVideoStore();
    render(<TitlesPanel />);

    fireEvent.change(screen.getByLabelText('Title template'), { target: { value: 'tpl-lower-third' } });
    fireEvent.click(screen.getByText('+ Add title at playhead'));

    const added = trackClips().find((c) => c.title?.templateId === 'tpl-lower-third');
    expect(added).toBeDefined();
    expect(added?.startOffset).toEqual(createRational(5, 1));

    // Select outside React events: wrap in act() so the panel re-renders
    // before querying (else the query can hit the pre-selection textarea
    // showing the same draft text and the edit lands in draft state).
    act(() => {
      useTimelineStore.getState().selectClip(added!.id);
    });
    const box = screen.getByLabelText('Title text') as HTMLTextAreaElement;
    expect(box.value).toBe('Name — Role');
    fireEvent.change(box, { target: { value: 'Jane — Host' } });
    expect(trackClips().find((c) => c.id === added!.id)?.title?.text).toBe('Jane — Host');

    useTimelineStore.getState().undo();
    expect(trackClips().find((c) => c.id === added!.id)?.title?.text).toBe('Name — Role');
  });

  it('saves the current title as a reusable custom template', () => {
    clearCustomTitleTemplates();
    seedVideoStore();
    render(<TitlesPanel />);

    fireEvent.change(screen.getByLabelText('Custom template name'), { target: { value: 'Hook' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByLabelText('Title template').textContent).toMatch(/Hook/);
  });

  it('mounts as the Titles tab in the copilot console', () => {
    clearCustomTitleTemplates();
    seedVideoStore();
    render(<AIPromptConsole />);
    fireEvent.click(screen.getByText('Titles'));
    expect(screen.getByLabelText('Title template')).toBeTruthy();
    expect(screen.getByText('+ Add title at playhead')).toBeTruthy();
  });
});
