import { create } from 'zustand';
import { TimelineState, Track, Clip } from '../types/timeline';
import { secondsToRational, compareRational, RationalTime } from '../types/time';
import { Command } from '../core/commands';
import { AddTrackCommand, AddClipCommand, RemoveClipCommand, ToggleTrackStateCommand } from '../core/commands/storeCommands';
import {
  SplitCommand,
  TrimCommand,
  RippleDeleteCommand,
  MoveCommand,
  OverwriteCommand,
  SlipCommand,
  SlideCommand
} from '../core/commands/edits';

interface UndoState {
  past: Command[];
  future: Command[];
}

interface TimelineStoreActions {
  executeCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  setPlayheadPosition: (time: RationalTime) => void;
  setWorkspace: (workspace: TimelineState['activeWorkspace']) => void;
  toggleMagneticSnapping: () => void;
  setZoomLevel: (zoom: number) => void;
  selectClip: (clipId: string, multiSelect?: boolean) => void;
  toggleTrackState: (trackId: string, property: 'muted' | 'locked' | 'solo') => void;
  addTrack: (type: Track['type'], name?: string) => void;
  addClipToTrack: (trackId: string, clip: Clip) => void;
  removeClip: (clipId: string) => void;
  rippleDelete: (startTime: RationalTime, duration: RationalTime) => void;
  splitClip: (clipId: string, splitTime: RationalTime) => void;
  trimClip: (clipId: string, edge: 'in' | 'out', delta: RationalTime) => void;
  moveClip: (clipId: string, newStartOffset: RationalTime, newTrackId?: string) => void;
  slipClip: (clipId: string, delta: RationalTime) => void;
  slideClip: (clipId: string, delta: RationalTime) => void;
  overwriteClip: (trackId: string, clip: Clip) => void;
}

export type TimelineStore = TimelineState & UndoState & TimelineStoreActions;

const initialTimelineState: TimelineState & UndoState = {
  past: [],
  future: [],
  version: '1.0.0',
  projectId: 'proj_demo_01',
  metadata: {
    name: 'Social_Short_Launch',
    fps: 59.94,
    width: 1080,
    height: 1920,
    sampleRate: 48000,
    colorSpace: 'Rec.709',
  },
  playheadPosition: secondsToRational(0.0),
  inPoint: null,
  outPoint: null,
  activeWorkspace: 'edit',
  magneticSnapping: true,
  zoomLevel: 20, // 20 pixels per second
  selectedClipIds: [],
  tracks: [
    {
      id: 'track_v2',
      type: 'video',
      index: 0,
      name: 'V2 - Overlays & Graphics',
      muted: false,
      locked: false,
      solo: false,
      height: 64,
      clips: [],
    },
    {
      id: 'track_v1',
      type: 'video',
      index: 1,
      name: 'V1 - Main A-Roll Video',
      muted: false,
      locked: false,
      solo: false,
      height: 72,
      clips: [
        {
          "id": "clip_v1_001",
          "assetId": "asset_interview_01",
          "name": "Interview_Take1.mp4",
          "startOffset": secondsToRational(0.0),
          "sourceIn": secondsToRational(0.0),
          "sourceOut": secondsToRational(15.0),
          "duration": secondsToRational(15.0),
          "transform": {
            "position": { "x": 0.0, "y": 0.0 },
            "scale": { "x": 1.0, "y": 1.0 },
            "rotation": 0,
            "opacity": 1.0,
            "anchorPoint": { "x": 0.5, "y": 0.5 }
          }
        },
        {
          "id": "clip_v1_002",
          "assetId": "asset_broll_02",
          "name": "Product_Broll.mp4",
          "startOffset": secondsToRational(15.0),
          "sourceIn": secondsToRational(2.0),
          "sourceOut": secondsToRational(12.0),
          "duration": secondsToRational(10.0)
        }
      ],
    },
    {
      id: 'track_a1',
      type: 'audio',
      index: 2,
      name: 'A1 - Dialogue Track',
      muted: false,
      locked: false,
      solo: false,
      height: 56,
      clips: [
        {
          "id": "clip_a1_001",
          "assetId": "asset_interview_01",
          "name": "Interview_Take1.wav",
          "startOffset": secondsToRational(0.0),
          "sourceIn": secondsToRational(0.0),
          "sourceOut": secondsToRational(15.0),
          "duration": secondsToRational(15.0),
          "volume": 0,
          "pan": 0
        }
      ],
    },
    {
      id: 'track_a2',
      type: 'audio',
      index: 3,
      name: 'A2 - Background Music (Auto-Ducked)',
      muted: false,
      locked: false,
      solo: false,
      height: 56,
      clips: [
        {
          "id": "clip_a2_001",
          "assetId": "asset_music_lofi",
          "name": "Upbeat_Lofi_Beat.mp3",
          "startOffset": secondsToRational(0.0),
          "sourceIn": secondsToRational(0.0),
          "sourceOut": secondsToRational(25.0),
          "duration": secondsToRational(25.0),
          "volume": -12,
          "pan": 0
        }
      ],
    }
  ],
};

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  ...initialTimelineState,

  executeCommand: (command: Command) => {
    set((state) => {
      let past = state.past;
      if (command.coalesceKey && past.length > 0) {
        const lastCommand = past[past.length - 1];
        if (lastCommand.coalesceKey === command.coalesceKey) {
          // Replace the last command if coalesce keys match
          past = past.slice(0, past.length - 1);
        }
      }

      const newState = command.apply(state);
      return {
        ...newState,
        past: [...past, command],
        future: [],
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.past.length === 0) return state;

      const newPast = [...state.past];
      const command = newPast.pop()!;
      const newState = command.invert(state);

      return {
        ...newState,
        past: newPast,
        future: [command, ...state.future],
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.future.length === 0) return state;

      const newFuture = [...state.future];
      const command = newFuture.shift()!;
      const newState = command.apply(state);

      return {
        ...newState,
        past: [...state.past, command],
        future: newFuture,
      };
    });
  },

  setPlayheadPosition: (time) =>
    set(() => ({ playheadPosition: compareRational(time, secondsToRational(0)) < 0 ? secondsToRational(0) : time })),

  setWorkspace: (workspace) =>
    set(() => ({ activeWorkspace: workspace })),

  toggleMagneticSnapping: () =>
    set((state) => ({ magneticSnapping: !state.magneticSnapping })),

  setZoomLevel: (zoom) =>
    set(() => ({ zoomLevel: Math.max(5, Math.min(200, zoom)) })),

  selectClip: (clipId, multiSelect = false) =>
    set((state) => ({
      selectedClipIds: multiSelect
        ? state.selectedClipIds.includes(clipId)
          ? state.selectedClipIds.filter((id) => id !== clipId)
          : [...state.selectedClipIds, clipId]
        : [clipId],
    })),

  toggleTrackState: (trackId, property) => {
    get().executeCommand(new ToggleTrackStateCommand(trackId, property));
  },

  addTrack: (type, name) => {
    const state = get();
    get().executeCommand(new AddTrackCommand(type, name || `${type.toUpperCase()} Track ${state.tracks.length + 1}`, state.tracks.length));
  },

  addClipToTrack: (trackId, clip) => {
    get().executeCommand(new AddClipCommand(trackId, clip));
  },

  removeClip: (clipId) => {
    get().executeCommand(new RemoveClipCommand(clipId));
  },

  rippleDelete: (startTime, duration) => {
    get().executeCommand(new RippleDeleteCommand(startTime, duration));
  },

  splitClip: (clipId, splitTime) => {
    get().executeCommand(new SplitCommand(clipId, splitTime));
  },

  trimClip: (clipId, edge, delta) => {
    get().executeCommand(new TrimCommand(clipId, edge, delta));
  },

  moveClip: (clipId, newStartOffset, newTrackId) => {
    get().executeCommand(new MoveCommand(clipId, newStartOffset, newTrackId));
  },

  slipClip: (clipId, delta) => {
    get().executeCommand(new SlipCommand(clipId, delta));
  },

  slideClip: (clipId, delta) => {
    get().executeCommand(new SlideCommand(clipId, delta));
  },

  overwriteClip: (trackId, clip) => {
    get().executeCommand(new OverwriteCommand(trackId, clip));
  },
}));
