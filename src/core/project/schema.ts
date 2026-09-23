export interface RationalTimeSchema {
  value: number;
  rate: number;
}

export interface MediaPoolAssetSchema {
  asset_id: string;
  name: string;
  file_path: string;
  proxy_path?: string;
  checksum_sha256?: string;
  duration?: RationalTimeSchema;
  /** R24.7: editorial metadata (scene/take/rating/tags). */
  scene?: string;
  take?: number;
  rating?: number;
  tags?: string[];
  video_streams?: {
    stream_index: number;
    codec: string;
    width: number;
    height: number;
    pixel_aspect: string;
    bit_depth: number;
  }[];
  audio_streams?: {
    stream_index: number;
    codec: string;
    channels: number;
    sample_rate: number;
  }[];
}

export interface TitleSpecSchema {
  text: string;
  font_family: string;
  font_size: number;
  color: string;
  background?: string;
  align: 'left' | 'center' | 'right';
  box: { x: number; y: number; w: number; h: number };
  fade_in_sec?: number;
  fade_out_sec?: number;
  template_id?: string;
}

export interface ProjectClipSchema {
  type: 'Clip' | 'Title';
  clip_id: string;
  /** Required for 'Clip'; absent for 'Title' (generated content). */
  asset_reference_id?: string;
  source_range: {
    start_time: RationalTimeSchema;
    duration: RationalTimeSchema;
  };
  timeline_range: {
    start_time: RationalTimeSchema;
    duration: RationalTimeSchema;
  };
  transforms?: {
    position_x?: { static_value: number; keyframes: any[] };
    position_y?: { static_value: number; keyframes: any[] };
    scale?: { static_value: number; keyframes: any[] };
    rotation?: { static_value: number; keyframes: any[] };
    opacity?: { static_value: number; keyframes: any[] };
    blend_mode?: string;
  };
  effects?: {
    effect_id: string;
    plugin_identifier: string;
    enabled: boolean;
    parameters: any;
  }[];
  volume_envelope?: {
    time: RationalTimeSchema;
    gain_db: number;
  }[];
  /** R24.4: present only when type is 'Title'. */
  title?: TitleSpecSchema;
  /** R26.1: present on compound containers (children recurse). */
  compound?: {
    name: string;
    clips: ProjectClipSchema[];
  };
  /** R26.1: marks an adjustment-layer span clip. */
  adjustment?: boolean;
}

export interface ProjectTrackSchema {
  track_id: string;
  name: string;
  locked?: boolean;
  visible?: boolean;
  muted?: boolean;
  solo?: boolean;
  fader_gain_db?: number;
  pan?: number;
  items: ProjectClipSchema[];
}

export interface SequenceMarkerSchema {
  marker_id: string;
  name: string;
  color: string;
  time: RationalTimeSchema;
}

/** R26.5: timecoded review comment (collaboration annotation). */
export interface SequenceCommentSchema {
  comment_id: string;
  author: string;
  body: string;
  resolved: boolean;
  created_at: string;
  time: RationalTimeSchema;
}

/** R26.5: project version snapshot (append-only history entry). */
export interface ProjectVersionSchema {
  version_id: string;
  label: string;
  saved_at: string;
  /** Full serialized project document at this version. */
  project_json: string;
}

export interface SequenceSchema {
  sequence_id: string;
  name: string;
  time_base: RationalTimeSchema;
  start_timecode: RationalTimeSchema;
  canvas: {
    width: number;
    height: number;
    pixel_aspect_ratio: number;
  };
  video_tracks: ProjectTrackSchema[];
  audio_tracks: ProjectTrackSchema[];
  /** R24.7: user markers (annotation only). */
  markers?: SequenceMarkerSchema[];
  /** R26.5: timecoded review comments. */
  comments?: SequenceCommentSchema[];
}

export interface ProjectMetadataSchema {
  title: string;
  created_at: string;
  modified_at: string;
  color_management?: {
    framework: string;
    config_path: string;
    working_space: string;
    display_device: string;
    display_view: string;
  };
}

export interface ProjectDocumentSchema {
  $schema: string;
  project_id: string;
  schema_version: string;
  metadata: ProjectMetadataSchema;
  media_pool: MediaPoolAssetSchema[];
  sequences: SequenceSchema[];
  /** R26.5: append-only version history (newest first when present). */
  version_history?: ProjectVersionSchema[];
}
