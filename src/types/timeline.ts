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
  time: number; // in seconds
  value: number;
  easing?: string;
}

export interface Effect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

import { RationalTime } from './time';

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
  pan?: number;        // -1.0 to 1.0
  effects?: Effect[];
  audioEffects?: Effect[];
  keyframes?: Record<string, Keyframe[]>;
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
  tracks: Track[];
  selectedClipIds: string[];
  activeWorkspace: 'edit' | 'ai' | 'color' | 'audio' | 'export';
  magneticSnapping: boolean;
  zoomLevel: number; // Pixels per second
}
