import { TimelineState, Track, Clip } from '../../types/timeline';
import { MediaAsset } from '../../store/mediaPool';
import { ProjectDocumentSchema, MediaPoolAssetSchema, SequenceSchema, ProjectTrackSchema, ProjectClipSchema, RationalTimeSchema } from './schema';
import { createRational } from '../../types/time';

export function serializeProject(
  timelineState: TimelineState,
  assets: MediaAsset[]
): string {
  const mediaPool: MediaPoolAssetSchema[] = assets.map(asset => {
    let duration: RationalTimeSchema | undefined;

    // Duration in MediaAsset is a string like "value/rate"
    if (asset.duration && asset.duration.includes('/')) {
        const parts = asset.duration.split('/');
        duration = { value: parseInt(parts[0], 10), rate: parseInt(parts[1], 10) };
        if (isNaN(duration.value) || isNaN(duration.rate) || duration.rate === 0) {
           throw new Error(`Invalid duration fraction in asset ${asset.id}: ${asset.duration}`);
        }
    } else if (asset.duration) {
        throw new Error(`Duration format not supported in asset ${asset.id}, expected rational fraction string: ${asset.duration}`);
    } else {
        throw new Error(`Duration missing in asset ${asset.id}`);
    }

    return {
        asset_id: asset.id,
        name: asset.name,
        file_path: asset.path,
        checksum_sha256: asset.fingerprint,
        duration: duration
    };
  });

  const videoTracks = timelineState.tracks
    .filter(t => t.type === 'video')
    .map(serializeTrack);

  const audioTracks = timelineState.tracks
    .filter(t => t.type === 'audio')
    .map(serializeTrack);

  if (!timelineState.metadata.fps) {
    throw new Error("Project metadata is missing 'fps'");
  }
  if (!timelineState.metadata.width || !timelineState.metadata.height) {
    throw new Error("Project metadata is missing canvas dimensions");
  }
  if (!timelineState.projectId) {
    throw new Error("Project state is missing projectId");
  }

  let timeBaseValue = 1;
  let timeBaseRate = Math.round(timelineState.metadata.fps);
  if (Math.abs(timelineState.metadata.fps - 23.976) < 0.01) {
    timeBaseValue = 1001;
    timeBaseRate = 24000;
  } else if (Math.abs(timelineState.metadata.fps - 29.97) < 0.01) {
    timeBaseValue = 1001;
    timeBaseRate = 30000;
  } else if (Math.abs(timelineState.metadata.fps - 59.94) < 0.01) {
    timeBaseValue = 1001;
    timeBaseRate = 60000;
  }

  const mainSequence: SequenceSchema = {
    sequence_id: 'seq_main',
    name: timelineState.metadata.name || 'Master Sequence',
    time_base: createRational(timeBaseValue, timeBaseRate),
    start_timecode: createRational(0, 1),
    canvas: {
      width: timelineState.metadata.width,
      height: timelineState.metadata.height,
      pixel_aspect_ratio: 1.0,
    },
    video_tracks: videoTracks,
    audio_tracks: audioTracks,
  };

  const projectDoc: ProjectDocumentSchema = {
    $schema: "https://editor.standard/v1/project.schema.json",
    project_id: timelineState.projectId,
    schema_version: "1.4.0",
    metadata: {
      title: timelineState.metadata.name,
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      color_management: timelineState.metadata.colorSpace ? {
        framework: "OpenColorIO",
        config_path: `ocio://${timelineState.metadata.colorSpace.toLowerCase()}_config`,
        working_space: timelineState.metadata.colorSpace,
        display_device: "sRGB",
        display_view: "ACES 1.0 - SDR Video"
      } : undefined
    },
    media_pool: mediaPool,
    sequences: [mainSequence]
  };

  return JSON.stringify(projectDoc, null, 2);
}

function serializeTrack(track: Track): ProjectTrackSchema {
  return {
    track_id: track.id,
    name: track.name,
    locked: track.locked,
    visible: track.type === 'video' ? !track.muted : undefined,
    muted: track.muted,
    solo: track.solo,
    items: track.clips.map(serializeClip)
  };
}

function serializeClip(clip: Clip): ProjectClipSchema {
  const schemaClip: ProjectClipSchema = {
    type: 'Clip',
    clip_id: clip.id,
    asset_reference_id: clip.assetId,
    source_range: {
      start_time: { value: clip.sourceIn.value, rate: clip.sourceIn.rate },
      duration: { value: clip.duration.value, rate: clip.duration.rate }
    },
    timeline_range: {
      start_time: { value: clip.startOffset.value, rate: clip.startOffset.rate },
      duration: { value: clip.duration.value, rate: clip.duration.rate }
    }
  };

  if (clip.transform) {
    const convertKeyframes = (kfs: any[] | undefined) => kfs || [];
    const buildProp = (staticVal: number | null | undefined, kfs?: any[]) => {
      return {
        static_value: staticVal ?? 0,
        keyframes: convertKeyframes(kfs)
      };
    };

    schemaClip.transforms = {
      position_x: buildProp(clip.transform.position.x, clip.keyframes?.position_x),
      position_y: buildProp(clip.transform.position.y, clip.keyframes?.position_y),
      scale: buildProp(clip.transform.scale.x, clip.keyframes?.scale),
      rotation: buildProp(clip.transform.rotation, clip.keyframes?.rotation),
      opacity: buildProp(clip.transform.opacity, clip.keyframes?.opacity),
      blend_mode: "Normal"
    };
  }

  return schemaClip;
}

export function deserializeProject(
  jsonString: string
): { timelineState: Partial<TimelineState>, assets: MediaAsset[] } {
  const projectDoc = JSON.parse(jsonString) as ProjectDocumentSchema;

  if (projectDoc.$schema !== "https://editor.standard/v1/project.schema.json") {
    throw new Error("Invalid project schema version");
  }

  if (!projectDoc.sequences || projectDoc.sequences.length === 0) {
    throw new Error("Project JSON has no sequences");
  }
  if (!projectDoc.project_id) {
    throw new Error("Project JSON is missing project_id");
  }

  const assets: MediaAsset[] = projectDoc.media_pool.map(assetSchema => {
    if (!assetSchema.asset_id || !assetSchema.name || !assetSchema.file_path || !assetSchema.checksum_sha256) {
      throw new Error(`Media asset is missing required fields (asset_id, name, file_path, checksum_sha256).`);
    }

    if (!assetSchema.duration) {
      throw new Error(`Media asset ${assetSchema.asset_id} is missing duration`);
    }
    const duration = `${assetSchema.duration.value}/${assetSchema.duration.rate}`;

    let type: 'video' | 'audio' | 'subtitle' | 'ai' = 'video';
    if (assetSchema.audio_streams && assetSchema.audio_streams.length > 0 && (!assetSchema.video_streams || assetSchema.video_streams.length === 0)) {
        type = 'audio';
    }

    return {
      id: assetSchema.asset_id,
      name: assetSchema.name,
      path: assetSchema.file_path,
      type: type,
      duration: duration,
      fingerprint: assetSchema.checksum_sha256,
      isOffline: false
    };
  });

  const mainSequence = projectDoc.sequences[0];

  if (!mainSequence.time_base || !mainSequence.canvas) {
    throw new Error("Main sequence is missing time_base or canvas dimensions");
  }

  const tracks: Track[] = [
    ...(mainSequence.video_tracks || []).map((t, index) => deserializeTrack(t, 'video', index, mainSequence.canvas.height)),
    ...(mainSequence.audio_tracks || []).map((t, index) => deserializeTrack(t, 'audio', index, 100))
  ];

  if (!projectDoc.metadata) {
    throw new Error("Project JSON is missing metadata");
  }

  const fps = mainSequence.time_base.rate / mainSequence.time_base.value;

  let sampleRate: number | undefined;
  for (const asset of projectDoc.media_pool) {
    if (asset.audio_streams && asset.audio_streams.length > 0 && asset.audio_streams[0].sample_rate) {
      sampleRate = asset.audio_streams[0].sample_rate;
      break;
    }
  }
  if (!sampleRate) {
     throw new Error("Could not determine sample rate from media pool");
  }

  const timelineState: Partial<TimelineState> = {
    version: projectDoc.schema_version,
    projectId: projectDoc.project_id,
    metadata: {
      name: projectDoc.metadata.title,
      fps: fps,
      width: mainSequence.canvas.width,
      height: mainSequence.canvas.height,
      sampleRate: sampleRate,
      colorSpace: projectDoc.metadata.color_management?.working_space || 'sRGB'
    },
    tracks,
  };

  return { timelineState, assets };
}

function deserializeTrack(schemaTrack: ProjectTrackSchema, type: 'video' | 'audio', index: number, defaultHeight: number): Track {
  if (!schemaTrack.track_id || !schemaTrack.name) {
      throw new Error(`Track ${type} index ${index} is missing track_id or name`);
  }
  return {
    id: schemaTrack.track_id,
    type,
    index,
    name: schemaTrack.name,
    muted: schemaTrack.muted || false,
    locked: schemaTrack.locked || false,
    solo: schemaTrack.solo || false,
    height: defaultHeight,
    clips: (schemaTrack.items || []).map(c => deserializeClip(c, schemaTrack.track_id))
  };
}

function deserializeClip(schemaClip: ProjectClipSchema, trackId: string): Clip {
  if (!schemaClip.clip_id || !schemaClip.asset_reference_id || !schemaClip.timeline_range || !schemaClip.source_range) {
      throw new Error(`Clip in track ${trackId} is missing required fields (clip_id, asset_reference_id, timeline_range, source_range)`);
  }

  const keyframes: Record<string, any[]> = {};

  const parseTransformProp = (prop: { static_value?: number | null, keyframes: any[] } | undefined, defaultVal: number, propName: string) => {
      if (prop?.keyframes && prop.keyframes.length > 0) {
          keyframes[propName] = prop.keyframes.map(k => ({
              time: k.time.value / k.time.rate,
              value: k.value,
              easing: k.interpolation || 'linear'
          }));
          return defaultVal;
      }
      return prop?.static_value ?? defaultVal;
  };

  const transform = schemaClip.transforms ? {
    position: {
      x: parseTransformProp(schemaClip.transforms.position_x, 0, 'position_x'),
      y: parseTransformProp(schemaClip.transforms.position_y, 0, 'position_y'),
    },
    scale: {
      x: parseTransformProp(schemaClip.transforms.scale, 1, 'scale'),
      y: parseTransformProp(schemaClip.transforms.scale, 1, 'scale'),
    },
    rotation: parseTransformProp(schemaClip.transforms.rotation, 0, 'rotation'),
    opacity: parseTransformProp(schemaClip.transforms.opacity, 1, 'opacity'),
    anchorPoint: { x: 0, y: 0 }
  } : undefined;

  return {
    id: schemaClip.clip_id,
    assetId: schemaClip.asset_reference_id,
    name: schemaClip.clip_id,
    startOffset: createRational(schemaClip.timeline_range.start_time.value, schemaClip.timeline_range.start_time.rate),
    sourceIn: createRational(schemaClip.source_range.start_time.value, schemaClip.source_range.start_time.rate),
    sourceOut: createRational(
      schemaClip.source_range.start_time.value * schemaClip.source_range.duration.rate + schemaClip.source_range.duration.value * schemaClip.source_range.start_time.rate,
      schemaClip.source_range.start_time.rate * schemaClip.source_range.duration.rate
    ),
    duration: createRational(schemaClip.source_range.duration.value, schemaClip.source_range.duration.rate),
    transform,
    keyframes: Object.keys(keyframes).length > 0 ? keyframes : undefined
  };
}
