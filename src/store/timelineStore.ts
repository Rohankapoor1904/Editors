import { create } from 'zustand';
import { TimelineState, Track, Clip } from '../types/timeline';

interface TimelineStoreActions {
  setPlayheadPosition: (time: number) => void;
  setWorkspace: (workspace: TimelineState['activeWorkspace']) => void;
  toggleMagneticSnapping: () => void;
  setZoomLevel: (zoom: number) => void;
  selectClip: (clipId: string, multiSelect?: boolean) => void;
  addTrack: (type: Track['type'], name?: string) => void;
  addClipToTrack: (trackId: string, clip: Clip) => void;
  removeClip: (clipId: string) => void;
  rippleDelete: (startTime: number, duration: number) => void;
}

export type TimelineStore = TimelineState & TimelineStoreActions;

const initialTimelineState: TimelineState = {
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
  playheadPosition: 0.0,
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
          "startOffset": 0.0,
          "sourceIn": 0.0,
          "sourceOut": 15.0,
          "duration": 15.0,
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
          "startOffset": 15.0,
          "sourceIn": 2.0,
          "sourceOut": 12.0,
          "duration": 10.0
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
          "startOffset": 0.0,
          "sourceIn": 0.0,
          "sourceOut": 15.0,
          "duration": 15.0,
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
          "startOffset": 0.0,
          "sourceIn": 0.0,
          "sourceOut": 25.0,
          "duration": 25.0,
          "volume": -12,
          "pan": 0
        }
      ],
    }
  ],
};

export const useTimelineStore = create<TimelineStore>((set) => ({
  ...initialTimelineState,

  setPlayheadPosition: (time) =>
    set(() => ({ playheadPosition: Math.max(0, time) })),

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

  addTrack: (type, name) =>
    set((state) => {
      const newTrack: Track = {
        id: `track_${type}_${Date.now()}`,
        type,
        index: state.tracks.length,
        name: name || `${type.toUpperCase()} Track ${state.tracks.length + 1}`,
        muted: false,
        locked: false,
        solo: false,
        height: type === 'video' ? 64 : 56,
        clips: [],
      };
      return { tracks: [...state.tracks, newTrack] };
    }),

  addClipToTrack: (trackId, clip) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? { ...track, clips: [...track.clips, clip] }
          : track
      ),
    })),

  removeClip: (clipId) =>
    set((state) => ({
      selectedClipIds: state.selectedClipIds.filter((id) => id !== clipId),
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips.filter((c) => c.id !== clipId),
      })),
    })),

  rippleDelete: (startTime, duration) =>
    set((state) => ({
      tracks: state.tracks.map((track) => ({
        ...track,
        clips: track.clips
          .filter(
            (c) =>
              !(
                c.startOffset >= startTime &&
                c.startOffset + c.duration <= startTime + duration
              )
          )
          .map((c) => {
            if (c.startOffset >= startTime + duration) {
              return { ...c, startOffset: c.startOffset - duration };
            }
            return c;
          }),
      })),
    })),
}));
