import { TimelineState, Track, Clip } from '../../types/timeline';
import { MediaAsset } from '../../store/mediaPool';
import { ProjectDocumentSchema, MediaPoolAssetSchema, SequenceSchema, ProjectTrackSchema, ProjectClipSchema, RationalTimeSchema } from './schema';
import { createRational } from '../../types/time';

/**
 * Parses a MediaAsset duration string into rational schema form (R22.6).
 *
 * Accepted (real) formats:
 * - `"value/rate"` — exact rational frames (e.g. `"240/24"`).
 * - `"HH:MM:SS[.mmm]"` — wall-clock, converted at `projectFps`
 *   (e.g. `"00:00:10"` at 24fps → `{ value: 240, rate: 24 }`).
 *
 * Anything else (empty, garbage, non-positive rate, unusable fps) yields
 * `undefined` so the schema-optional field is omitted — never invented.
 */
export function parseAssetDuration(
  raw: string | undefined,
  projectFps: number
): RationalTimeSchema | undefined {
  if (!raw) return undefined;

  if (raw.includes('/')) {
    const parts = raw.split('/');
    if (parts.length !== 2) return undefined;
    const value = Number(parts[0]);
    const rate = Number(parts[1]);
    if (!Number.isInteger(value) || !Number.isInteger(rate) || rate <= 0 || value < 0) {
      return undefined;
    }
    return { value, rate };
  }

  const match = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(raw.trim());
  if (!match) return undefined;
  if (!Number.isFinite(projectFps) || projectFps <= 0) return undefined;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  const rate = Math.round(projectFps);
  if (rate <= 0) return undefined;
  return { value: Math.round(seconds * projectFps), rate };
}

export function serializeProject(
  timelineState: TimelineState,
  assets: MediaAsset[]
): string {
  const projectFps = timelineState.metadata.fps;
  const mediaPool: MediaPoolAssetSchema[] = assets.map(asset => {
    // R22.6: parse real duration formats only ("value/rate", "HH:MM:SS[.mmm]").
    // Anything else is omitted (schema-optional) — never invented.
    const duration = parseAssetDuration(asset.duration, projectFps);

    return {
        asset_id: asset.id,
        name: asset.name,
        file_path: asset.path,
        checksum_sha256: asset.fingerprint,
        duration: duration,
        // R24.7: editorial metadata round-trips when present.
        scene: asset.scene,
        take: asset.take,
        rating: asset.rating,
        tags: asset.tags ? [...asset.tags] : undefined,
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
  const projectId = timelineState.projectId || 'proj_default';

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
    // R24.7: markers persist as annotation (omitted when empty).
    markers: (timelineState.markers ?? []).length > 0
      ? (timelineState.markers ?? []).map((m) => ({
          marker_id: m.id,
          name: m.name,
          color: m.color,
          time: { value: m.time.value, rate: m.time.rate },
        }))
      : undefined,
    // R26.5: timecoded review comments persist (omitted when empty).
    comments: (timelineState.comments ?? []).length > 0
      ? (timelineState.comments ?? []).map((c) => ({
          comment_id: c.id,
          author: c.author,
          body: c.body,
          resolved: c.resolved,
          created_at: c.createdAt,
          time: { value: c.time.value, rate: c.time.rate },
        }))
      : undefined,
  };

  const projectDoc: ProjectDocumentSchema = {
    $schema: "https://editor.standard/v1/project.schema.json",
    project_id: projectId,
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
  // R24.4: title clips persist as type 'Title' with their spec and no
  // asset reference (generated content, never a file on disk).
  if (clip.title) {
    return {
      type: 'Title',
      clip_id: clip.id,
      source_range: {
        start_time: { value: clip.sourceIn.value, rate: clip.sourceIn.rate },
        duration: { value: clip.duration.value, rate: clip.duration.rate }
      },
      timeline_range: {
        start_time: { value: clip.startOffset.value, rate: clip.startOffset.rate },
        duration: { value: clip.duration.value, rate: clip.duration.rate }
      },
      title: {
        text: clip.title.text,
        font_family: clip.title.fontFamily,
        font_size: clip.title.fontSize,
        color: clip.title.color,
        background: clip.title.background,
        align: clip.title.align,
        box: { ...clip.title.box },
        fade_in_sec: clip.title.fadeInSec,
        fade_out_sec: clip.title.fadeOutSec,
        template_id: clip.title.templateId,
      }
    };
  }

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

  // R26.1: compound children recurse (relative offsets preserved verbatim);
  // adjustment spans persist as a flag (grade rides the colorGrade effect).
  if (clip.compound) {
    schemaClip.compound = {
      name: clip.compound.name,
      clips: clip.compound.clips.map(serializeClip),
    };
  }
  if (clip.adjustment) {
    schemaClip.adjustment = true;
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

    // R22.6: duration is schema-optional. A missing duration means
    // "unknown" (empty string) — it must round-trip, never throw, and never
    // be replaced with an invented value.
    const duration = assetSchema.duration
      ? `${assetSchema.duration.value}/${assetSchema.duration.rate}`
      : '';

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
      isOffline: false,
      // R24.7: editorial metadata (absent stays undefined).
      scene: assetSchema.scene,
      take: assetSchema.take,
      rating: assetSchema.rating,
      tags: assetSchema.tags ? [...assetSchema.tags] : undefined,
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
    // R24.7: markers round-trip (absent means none).
    markers: (mainSequence.markers ?? []).map((m) => ({
      id: m.marker_id,
      name: m.name,
      color: m.color,
      time: createRational(m.time.value, m.time.rate),
    })),
    // R26.5: review comments round-trip (absent means none).
    comments: (mainSequence.comments ?? []).map((c) => ({
      id: c.comment_id,
      author: c.author,
      body: c.body,
      resolved: c.resolved,
      createdAt: c.created_at,
      time: createRational(c.time.value, c.time.rate),
    })),
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
  if (!schemaClip.clip_id || !schemaClip.timeline_range || !schemaClip.source_range) {
      throw new Error(`Clip in track ${trackId} is missing required fields (clip_id, timeline_range, source_range)`);
  }
  // R24.4: 'Clip' items reference media; 'Title' items carry their spec.
  if ((schemaClip.type ?? 'Clip') === 'Clip' && !schemaClip.asset_reference_id) {
      throw new Error(`Clip ${schemaClip.clip_id} in track ${trackId} is missing asset_reference_id`);
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

  const isTitle = (schemaClip.type ?? 'Clip') === 'Title';
  if (isTitle && !schemaClip.title) {
      throw new Error(`Title clip ${schemaClip.clip_id} in track ${trackId} is missing its title spec`);
  }
  if (schemaClip.compound && (!Array.isArray(schemaClip.compound.clips) || schemaClip.compound.clips.length === 0)) {
      throw new Error(`Compound clip ${schemaClip.clip_id} in track ${trackId} carries no children`);
  }

  return {
    id: schemaClip.clip_id,
    assetId: schemaClip.asset_reference_id ?? `title://${schemaClip.clip_id}`,
    name: schemaClip.clip_id,
    startOffset: createRational(schemaClip.timeline_range.start_time.value, schemaClip.timeline_range.start_time.rate),
    sourceIn: createRational(schemaClip.source_range.start_time.value, schemaClip.source_range.start_time.rate),
    sourceOut: createRational(
      schemaClip.source_range.start_time.value * schemaClip.source_range.duration.rate + schemaClip.source_range.duration.value * schemaClip.source_range.start_time.rate,
      schemaClip.source_range.start_time.rate * schemaClip.source_range.duration.rate
    ),
    duration: createRational(schemaClip.source_range.duration.value, schemaClip.source_range.duration.rate),
    transform,
    keyframes: Object.keys(keyframes).length > 0 ? keyframes : undefined,
    // R26.1: compound children deserialize recursively (offsets stay
    // span-relative, exactly as the nest command stores them).
    compound: schemaClip.compound ? {
      name: schemaClip.compound.name,
      clips: schemaClip.compound.clips.map((c) => deserializeClip(c, trackId)),
    } : undefined,
    adjustment: schemaClip.adjustment || undefined,
    title: schemaClip.title ? {
      text: schemaClip.title.text,
      fontFamily: schemaClip.title.font_family,
      fontSize: schemaClip.title.font_size,
      color: schemaClip.title.color,
      background: schemaClip.title.background,
      align: schemaClip.title.align,
      box: { ...schemaClip.title.box },
      fadeInSec: schemaClip.title.fade_in_sec,
      fadeOutSec: schemaClip.title.fade_out_sec,
      templateId: schemaClip.title.template_id,
    } : undefined,
  };
}
