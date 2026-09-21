import { create } from 'zustand';
import { TimelineState, Track, Clip, Transform, Keyframe } from '../types/timeline';
import { secondsToRational, rationalToSeconds, compareRational, RationalTime } from '../types/time';
import { Command } from '../core/commands';
import { AddTrackCommand, AddClipCommand, RemoveClipCommand, ToggleTrackStateCommand } from '../core/commands/storeCommands';
import { ToggleClipMuteCommand } from '../core/commands/edits';
import {
  SplitCommand,
  TrimCommand,
  RippleDeleteCommand,
  MoveCommand,
  OverwriteCommand,
  InsertCommand,
  SlipCommand,
  SlideCommand,
  SplitTrimCommand,
  RealignSyncCommand,
  UpdateTransformCommand,
  UpdateClipEffectCommand,
  SetKeyframeCommand,
  RemoveKeyframeCommand,
  ApplySpeedRampCommand,
  ApplyAutoReframeCommand
} from '../core/commands/edits';
import { SpeedRampConfig } from '../types/timeline';
import { autoReframeEngine } from '../engine/autoReframe';
import { nativeBridge } from '../services/nativeBridge';
import { audioEngine } from '../engine/audioEngine';
import { useMediaPoolStore } from './mediaPool';

interface UndoState {
  past: Command[];
  future: Command[];
}

interface TimelineStoreActions {
  executeCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  setPlayheadPosition: (time: RationalTime) => void;
  setTargetTrack: (trackId: string | null) => void;
  setWorkspace: (workspace: TimelineState['activeWorkspace']) => void;
  toggleMagneticSnapping: () => void;
  setZoomLevel: (zoom: number) => void;
  selectClip: (clipId: string, multiSelect?: boolean) => void;
  toggleTrackState: (trackId: string, property: 'muted' | 'locked' | 'solo') => void;
  setTrackVolume: (trackId: string, volumeDb: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  addTrack: (type: Track['type'], name?: string) => void;
  addClipToTrack: (trackId: string, clip: Clip) => void;
  removeClip: (clipId: string) => void;
  rippleDelete: (startTime: RationalTime, duration: RationalTime) => void;
  splitClip: (clipId: string, splitTime: RationalTime) => void;
  trimClip: (clipId: string, edge: 'in' | 'out', delta: RationalTime) => void;
  splitTrimClip: (clipId: string, edge: 'in' | 'out', delta: RationalTime) => void;
  moveClip: (clipId: string, newStartOffset: RationalTime, newTrackId?: string) => void;
  slipClip: (clipId: string, delta: RationalTime, maxSourceDuration?: RationalTime) => void;
  slideClip: (clipId: string, delta: RationalTime) => void;
  overwriteClip: (trackId: string, clip: Clip) => void;
  insertClip: (trackId: string, clip: Clip, rippleAllTracks?: boolean) => void;
  realignSync: (clipId: string) => void;
  toggleClipMute: (clipId: string) => void;
  updateClipTransform: (clipId: string, transform: Transform) => void;
  updateClipEffect: (clipId: string, effectId: string, effectType: string, params: Record<string, unknown>) => void;
  setClipKeyframe: (clipId: string, property: string, keyframe: Keyframe) => void;
  removeClipKeyframe: (clipId: string, property: string, time: RationalTime) => void;
  applySpeedRamp: (clipId: string, speedConfig: SpeedRampConfig) => void;
  autoReframeClipToAspect: (
    clipId: string,
    targetAspect?: number,
    subjectTrajectory?: { frameIndex: number; timestamp: number; subjectCenterX: number }[]
  ) => void;
  separateClipStems: (clipId: string) => Promise<{ vocalClipId: string; instrumentalClipId: string } | null>;
  applyNoiseIsolation: (clipId: string, strength?: number, enableLeveler?: boolean) => Promise<{ outputPath: string; snrImprovementDb: number } | null>;
}

export type TimelineStore = TimelineState & UndoState & TimelineStoreActions;

const initialTimelineState: TimelineState & UndoState = {
  past: [],
  future: [],
  targetTrackId: null,
  version: '1.0.0',
  projectId: 'proj_default',
  metadata: {
    name: 'New Project',
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
      volume: 0,
      pan: 0,
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
      volume: 0,
      pan: 0,
      clips: [],
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
      volume: 0,
      pan: 0,
      clips: [],
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
      volume: 0,
      pan: 0,
      clips: [],
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

  setTrackVolume: (trackId, volumeDb) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, volume: volumeDb } : t)),
    }));
    audioEngine.setTrackVolume(trackId, volumeDb);
  },

  setTrackPan: (trackId, pan) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, pan } : t)),
    }));
    audioEngine.setTrackPan(trackId, pan);
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

  setTargetTrack: (trackId) => {
    set({ targetTrackId: trackId });
  },

  trimClip: (clipId, edge, delta) => {
    get().executeCommand(new TrimCommand(clipId, edge, delta));
  },

  splitTrimClip: (clipId, edge, delta) => {
    get().executeCommand(new SplitTrimCommand(clipId, edge, delta));
  },

  moveClip: (clipId, newStartOffset, newTrackId) => {
    get().executeCommand(new MoveCommand(clipId, newStartOffset, newTrackId));
  },

  slipClip: (clipId, delta, maxSourceDuration) => {
    get().executeCommand(new SlipCommand(clipId, delta, maxSourceDuration));
  },

  slideClip: (clipId, delta) => {
    get().executeCommand(new SlideCommand(clipId, delta));
  },

  overwriteClip: (trackId, clip) => {
    get().executeCommand(new OverwriteCommand(trackId, clip));
  },

  insertClip: (trackId, clip, rippleAllTracks) => {
    get().executeCommand(new InsertCommand(trackId, clip, rippleAllTracks));
  },

  realignSync: (clipId) => {
    get().executeCommand(new RealignSyncCommand(clipId));
  },
  toggleClipMute: (clipId) => {
    get().executeCommand(new ToggleClipMuteCommand(clipId));
  },
  updateClipTransform: (clipId, transform) => {
    get().executeCommand(new UpdateTransformCommand(clipId, transform));
  },
  updateClipEffect: (clipId, effectId, effectType, params) => {
    get().executeCommand(new UpdateClipEffectCommand(clipId, effectId, effectType, params));
  },
  setClipKeyframe: (clipId, property, keyframe) => {
    get().executeCommand(new SetKeyframeCommand(clipId, property, keyframe));
  },
  removeClipKeyframe: (clipId, property, time) => {
    get().executeCommand(new RemoveKeyframeCommand(clipId, property, time));
  },
  applySpeedRamp: (clipId, speedConfig) => {
    get().executeCommand(new ApplySpeedRampCommand(clipId, speedConfig));
  },
  autoReframeClipToAspect: (clipId, targetAspect = 9 / 16, subjectTrajectory) => {
    const state = get();
    const clip = state.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return;

    const sourceWidth = state.metadata.width || 1920;
    const sourceHeight = state.metadata.height || 1080;
    const durationSec = rationalToSeconds(clip.duration);

    const reframeData = autoReframeEngine.generateAutoReframeKeyframes(
      sourceWidth,
      sourceHeight,
      durationSec,
      targetAspect,
      subjectTrajectory
    );

    get().executeCommand(
      new ApplyAutoReframeCommand(clipId, reframeData.initialTransform, {
        'position.x': reframeData.positionKeyframes,
      })
    );
  },
  separateClipStems: async (clipId: string) => {
    const state = get();
    const clip = state.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return null;

    const mediaPool = useMediaPoolStore.getState();
    const sourceAsset = mediaPool.assets.find((a) => a.id === clip.assetId);
    const sourcePath = sourceAsset?.path || clip.assetId || clip.name;
    const { vocalsPath, instrumentalPath } = await nativeBridge.separateAudioStems(sourcePath);

    // Register separated stems into media pool if not present
    if (!mediaPool.assets.some((a) => a.id === vocalsPath || a.path === vocalsPath)) {
      mediaPool.addAsset({
        id: vocalsPath,
        name: `${clip.name} (Vocals)`,
        path: vocalsPath,
        type: 'audio',
        duration: sourceAsset?.duration || '00:00:10',
        fingerprint: `fp_${Date.now()}_vocal`,
        isOffline: false,
      });
    }
    if (!mediaPool.assets.some((a) => a.id === instrumentalPath || a.path === instrumentalPath)) {
      mediaPool.addAsset({
        id: instrumentalPath,
        name: `${clip.name} (Instrumental)`,
        path: instrumentalPath,
        type: 'audio',
        duration: sourceAsset?.duration || '00:00:10',
        fingerprint: `fp_${Date.now()}_inst`,
        isOffline: false,
      });
    }

    // Find or create vocals track (dialogue) and instrumental track (music)
    let vocalTrack = get().tracks.find(
      (t) => t.type === 'audio' && (t.name.toLowerCase().includes('dialogue') || t.name.toLowerCase().includes('vocal'))
    );
    let instTrack = get().tracks.find(
      (t) => t.type === 'audio' && (t.name.toLowerCase().includes('music') || t.name.toLowerCase().includes('instrumental'))
    );

    if (!vocalTrack) {
      get().addTrack('audio', 'A - Vocals');
      vocalTrack = get().tracks[get().tracks.length - 1];
    }
    if (!instTrack) {
      get().addTrack('audio', 'A - Instrumental');
      instTrack = get().tracks[get().tracks.length - 1];
    }

    const vocalClipId = `clip_vocal_${Date.now()}`;
    const instrumentalClipId = `clip_inst_${Date.now()}`;

    const vocalClip: Clip = {
      id: vocalClipId,
      assetId: vocalsPath,
      name: `${clip.name} (Vocals)`,
      startOffset: { ...clip.startOffset },
      sourceIn: { ...clip.sourceIn },
      sourceOut: { ...clip.sourceOut },
      duration: { ...clip.duration },
      volume: 0,
      muted: false,
      pan: 0,
    };

    const instClip: Clip = {
      id: instrumentalClipId,
      assetId: instrumentalPath,
      name: `${clip.name} (Instrumental)`,
      startOffset: { ...clip.startOffset },
      sourceIn: { ...clip.sourceIn },
      sourceOut: { ...clip.sourceOut },
      duration: { ...clip.duration },
      volume: 0,
      muted: false,
      pan: 0,
    };

    get().addClipToTrack(vocalTrack.id, vocalClip);
    get().addClipToTrack(instTrack.id, instClip);

    return { vocalClipId, instrumentalClipId };
  },
  applyNoiseIsolation: async (clipId: string, strength = 0.75, enableLeveler = true) => {
    const state = get();
    const clip = state.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return null;

    const mediaPool = useMediaPoolStore.getState();
    const sourceAsset = mediaPool.assets.find((a) => a.id === clip.assetId);
    const sourcePath = sourceAsset?.path || clip.assetId || clip.name;
    const result = await nativeBridge.denoiseAudioFile(sourcePath, strength, enableLeveler);

    get().updateClipEffect(clipId, 'fx_voice_isolation', 'voice_isolation', {
      strength,
      enableLeveler,
      isolatedPath: result.outputPath,
      snrImprovementDb: result.snrImprovementDb,
    });

    return result;
  },
}));
