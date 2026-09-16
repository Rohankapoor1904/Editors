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

export interface ProjectClipSchema {
  type: 'Clip';
  clip_id: string;
  asset_reference_id: string;
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
    scale?: { static_value: number | null; keyframes: any[] };
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
}
