import { RationalTime } from './time';

export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  position: Point;
  scale: Point;
  rotation: number;
  opacity: number;
  anchorPoint: Point;
}

export interface Keyframe {
  time: RationalTime;
  value: number;
  easing?: string;
}

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface SpeedRampConfig {
  constantSpeed?: number; // e.g. 0.25 (25% slow-mo) to 4.0 (400% fast-forward)
  envelope?: Keyframe[];   // velocity envelope curve keyframes (time relative to clip, value = speed multiplier)
  reverse?: boolean;       // reverse clip playback
  preservePitch?: boolean; // pitch-corrected audio resample (default true)
}

export interface Clip {
  id: string;
  assetId: string;
  name: string;
  startOffset: RationalTime; // Timeline start time in seconds
  sourceIn: RationalTime;    // Media source start time in seconds
  sourceOut: RationalTime;   // Media source end time in seconds
  duration: RationalTime;    // Clip duration on timeline (seconds)
  transform?: Transform;
  volume?: number;     // In dB
  muted?: boolean;
  pan?: number;        // -1.0 to 1.0
  effects?: Effect[];
  audioEffects?: Effect[];
  keyframes?: Record<string, Keyframe[]>;
  speed?: number;          // Playback speed multiplier (default 1.0)
  speedRamp?: SpeedRampConfig;
  reverse?: boolean;
  linkedClipId?: string;   // Companion audio/video clip ID
  syncOffset?: RationalTime; // Difference between video startOffset and audio startOffset
  splitTrimType?: 'j-cut' | 'l-cut' | 'none'; // J-Cut (audio leads) or L-Cut (video leads)
}

export type TrackType = 'video' | 'audio' | 'subtitle';

export interface Track {
  id: string;
  type: TrackType;
  index: number;
  name: string;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  height: number;
  clips: Clip[];
}

export interface TimelineProjectMetadata {
  name: string;
  fps: number;
  width: number;
  height: number;
  sampleRate: number;
  colorSpace: string;
}

export interface TimelineState {
  version: string;
  projectId: string;
  metadata: TimelineProjectMetadata;
  playheadPosition: RationalTime; // in rational time
  inPoint: number | null;
  outPoint: number | null;
  targetTrackId?: string | null; // Active target track for 3-point inserts/overwrites
  tracks: Track[];
  selectedClipIds: string[];
  activeWorkspace: 'edit' | 'ai' | 'color' | 'audio' | 'export';
  magneticSnapping: boolean;
  zoomLevel: number; // Pixels per second
}
