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

// R24.1 — clip mask model (Auto Mask / tracker target).
// Coordinates are normalized [0,1] relative to the frame so masks survive
// resolution changes. Masks are session-side until project schema v1.5;
// serializeClip() intentionally omits them rather than inventing a mapping.
export type MaskShape = 'rect' | 'ellipse';

export type MaskSubjectClass =
  | 'person'
  | 'skin'
  | 'hair'
  | 'sky'
  | 'foliage'
  | 'clothing'
  | 'custom';

// R24.3 — Essential Sound audio role. Session-side tag driving role EQ
// presets, ducking participation and dynamics defaults.
export type AudioRole = 'dialogue' | 'music' | 'sfx' | 'ambience';

// R24.4 — title/motion-graphics model. Coordinates normalized [0,1].
export type TitleAlign = 'left' | 'center' | 'right';

export interface TitleBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TitleSpec {
  text: string;
  fontFamily: string;
  /** Base font size in frame-height fractions (0,1]. */
  fontSize: number;
  /** CSS color for the glyphs. */
  color: string;
  /** Optional translucent backdrop box. */
  background?: string;
  align: TitleAlign;
  box: TitleBox;
  /** Fade in/out in seconds, default 0. */
  fadeInSec?: number;
  fadeOutSec?: number;
  /** Template this title was spawned from (empty for ad-hoc). */
  templateId?: string;
}

export interface TitleTemplate {
  id: string;
  name: string;
  spec: Omit<TitleSpec, 'text' | 'templateId'> & { text: string };
}

// R24.7 — sequence markers (review notes, chapter points, to-dos).
export interface SequenceMarker {
  id: string;
  time: RationalTime;
  name: string;
  color: string;
}

// R26.5 — timecoded review comment (collaboration annotation).
export interface TimelineComment {
  id: string;
  time: RationalTime;
  author: string;
  body: string;
  resolved: boolean;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

// R26.2 — track automation lanes (volume dB / pan -1..1 over seconds).
// Session-side until schema v1.5; live per-tick audition deferred.
export type AutomationMode = 'snap' | 'latch' | 'trim';

export interface AutomationPoint {
  timeSec: number;
  value: number;
}

export interface AutomationLane {
  points: AutomationPoint[];
  mode: AutomationMode;
}

export interface TrackAutomation {
  volume: AutomationLane;
  pan: AutomationLane;
}

export interface ClipMask {
  id: string;
  shape: MaskShape;
  subjectClass: MaskSubjectClass;
  /** Normalized centroid [0,1]. */
  centerX: number;
  centerY: number;
  /** Normalized full extents (0,1]. */
  sizeX: number;
  sizeY: number;
  /** Radians, default 0. */
  rotation?: number;
  /** Edge softness 0..1, default 0 (hard edge). */
  feather?: number;
  /** Grade applies outside the shape instead of inside. */
  invert?: boolean;
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
  /** R24.1: subject masks (grading/tracking targets). Session-side only. */
  masks?: ClipMask[];
  /** R24.3: Essential Sound role tag. Session-side until schema v1.5. */
  audioRole?: AudioRole;
  /** R24.4: title spec. Persists through project JSON (schema Title type). */
  title?: TitleSpec;
  /**
   * R26.1: compound container (depth-1: children carry no compound of
   * their own). Children store offsets relative to the container start.
   */
  compound?: {
    name: string;
    clips: Clip[];
  };
  /** R26.1: adjustment layer — grade/effects span, no media of its own. */
  adjustment?: boolean;
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
  volume?: number; // In dB, default 0
  pan?: number;    // -1.0 to 1.0, default 0
  /** R26.2: automation lanes (session-side). */
  automation?: TrackAutomation;
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
  /** R24.7: user markers (annotation only, direct-set like selection). */
  markers: SequenceMarker[];
  /** R26.5: timecoded review comments (collaboration). */
  comments: TimelineComment[];
  magneticSnapping: boolean;
  zoomLevel: number; // Pixels per second
}
