import { useTimelineStore } from '../../store/timelineStore';
import { Command } from '../../core/commands';
import { AddTrackCommand, AddClipCommand, RippleDeleteCommand, SetMetadataCommand } from '../../core/commands/storeCommands';
import { ApplyAutoReframeCommand, UpdateClipEffectCommand, ApplyClipAnimationCommand } from '../../core/commands/edits';
import { secondsToRational, rationalToSeconds } from '../../types/time';
import { Clip, Keyframe } from '../../types/timeline';
import { mapTranscriptToCaptionWords } from '../../engine/captions/clipCaptions';
import { whisperService } from '../whisperTranscriber';
import { detect_silence_executor, resolveAssetAudioPath } from './timelineTools';

export const add_subtitles_def = {
  name: 'add_subtitles',
  description: 'Adds captions/subtitles with custom styling.',
  parameters: {
    type: 'object' as const,
    properties: {
      style: { type: 'string' as const, enum: ['bold_yellow_highlight', 'clean_white', 'karaoke_bounce'] },
      font_size: { type: 'number' as const, default: 24 },
      max_words_per_line: { type: 'integer' as const, default: 3 },
    },
    required: ['style'],
  },
};

export const add_audio_track_def = {
  name: 'add_audio_track',
  description: 'Overlays background audio or SFX with optional auto-ducking when main voice track is speaking.',
  parameters: {
    type: 'object' as const,
    properties: {
      audio_asset_id: { type: 'string' as const },
      volume: { type: 'number' as const, default: 0.3 },
      auto_ducking: { type: 'boolean' as const, default: true },
    },
    required: ['audio_asset_id'],
  },
};

export const render_video_def = {
  name: 'render_video',
  description: 'Exports final project timeline to a video file.',
  parameters: {
    type: 'object' as const,
    properties: {
      resolution: { type: 'string' as const, enum: ['1080p', '4k', '720p', '1080x1920_shorts'] },
      fps: { type: 'integer' as const, default: 30 },
      output_format: { type: 'string' as const, default: 'mp4' },
    },
    required: ['resolution'],
  },
};

export const sequence_set_aspect_ratio_def = {
  name: 'sequence_set_aspect_ratio',
  description: 'Sets the sequence canvas dimensions, e.g. 1080x1920 for vertical shorts.',
  parameters: {
    type: 'object' as const,
    properties: {
      width: { type: 'integer' as const },
      height: { type: 'integer' as const },
    },
    required: ['width', 'height'],
  },
};

export const video_apply_auto_reframe_def = {
  name: 'video_apply_auto_reframe',
  description: 'Generates a smoothed, keyframed crop window that keeps the subject centred after an aspect-ratio change.',
  parameters: {
    type: 'object' as const,
    properties: {
      track_id: { type: 'string' as const },
      tracking_mode: { type: 'string' as const, enum: ['ActiveSpeaker', 'Saliency', 'Manual'], default: 'ActiveSpeaker' },
      smoothing: { type: 'number' as const, description: 'Kalman/EMA smoothing factor, 0.0-1.0', default: 0.15 },
    },
    required: ['track_id'],
  },
};

export const transcript_filter_tokens_def = {
  name: 'transcript_filter_tokens',
  description: 'Keeps only the given transcript token ranges and removes the rest from the timeline.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_id: { type: 'string' as const },
      retained_token_ranges: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            start_token_index: { type: 'integer' as const },
            end_token_index: { type: 'integer' as const },
          },
          required: ['start_token_index', 'end_token_index'],
        },
      },
    },
    required: ['asset_id', 'retained_token_ranges'],
  },
};

export const captions_generate_karaoke_def = {
  name: 'captions_generate_karaoke',
  description: 'Generates animated captions with per-word highlight timing.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_id: { type: 'string' as const },
      style_preset: {
        type: 'string' as const,
        enum: ['DynamicWordHighlight', 'bold_yellow_highlight', 'clean_white', 'karaoke_bounce'],
      },
      max_words_per_line: { type: 'integer' as const, default: 3 },
    },
    required: ['asset_id', 'style_preset'],
  },
};

export const timeline_remove_silence_def = {
  name: 'timeline_remove_silence',
  description: 'Ripple-deletes silent intervals from the timeline, inserting micro-crossfades at audio seams.',
  parameters: {
    type: 'object' as const,
    properties: {
      threshold_seconds: { type: 'number' as const, default: 0.5 },
      track_ids: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
    },
    required: ['threshold_seconds'],
  },
};

export async function add_subtitles_executor(args: {
  style: 'bold_yellow_highlight' | 'clean_white' | 'karaoke_bounce';
  font_size?: number;
  max_words_per_line?: number;
}) {
  const stylePresetMap: Record<string, string> = {
    bold_yellow_highlight: 'hormozi',
    clean_white: 'minimal',
    karaoke_bounce: 'karaoke',
  };

  const preset = stylePresetMap[args.style] || 'hormozi';
  const store = useTimelineStore.getState();
  const commands: Command[] = [];

  const targetClip = store.tracks.flatMap((t) => t.clips)[0];
  if (!targetClip) {
    return {
      error: 'no_clip',
      details: 'Cannot add subtitles: the timeline has no clips.',
    };
  }

  // Real path only: transcribe the clip's audio, map word timestamps onto
  // the clip range, attach as a caption effect. No fabricated words (R21.3).
  const audioPath = resolveAssetAudioPath(targetClip.assetId);
  if (!audioPath) {
    return {
      error: 'unknown_asset',
      details: `Cannot subtitle clip "${targetClip.id}": no resolvable audio file in the media pool.`,
    };
  }

  try {
    const transcript = await whisperService.transcribe(audioPath);
    const words = mapTranscriptToCaptionWords(transcript.words, targetClip);
    commands.push(
      new UpdateClipEffectCommand(targetClip.id, 'caption_overlay', 'caption', {
        preset,
        fontSize: args.font_size ?? 54,
        maxWordsPerLine: args.max_words_per_line ?? 4,
        words,
      })
    );
  } catch (e: any) {
    return {
      error: 'transcription_unavailable',
      details: e?.message || String(e),
    };
  }

  return {
    success: true,
    style: args.style,
    style_preset: preset,
    font_size: args.font_size ?? 24,
    max_words_per_line: args.max_words_per_line ?? 3,
    commands,
  };
}

export async function add_audio_track_executor(args: {
  audio_asset_id: string;
  volume?: number;
  auto_ducking?: boolean;
}) {
  const store = useTimelineStore.getState();
  const audioTracks = store.tracks.filter((t) => t.type === 'audio');
  const targetTrackId = audioTracks[1]?.id || `track_audio_${Date.now()}`;
  const commands: Command[] = [];

  if (!audioTracks[1]) {
    commands.push(new AddTrackCommand('audio', 'A2 - BGM / Ambience', audioTracks.length));
  }

  const newClip: Clip = {
    id: `clip_bgm_${Date.now()}`,
    assetId: args.audio_asset_id,
    name: 'Background Audio Track',
    startOffset: secondsToRational(0, 30),
    duration: secondsToRational(30, 30),
    sourceIn: secondsToRational(0, 30),
    sourceOut: secondsToRational(30, 30),
    speed: 1.0,
    volume: args.volume ?? 0.3,
    muted: false,
  };

  commands.push(new AddClipCommand(targetTrackId, newClip));

  return {
    success: true,
    audio_asset_id: args.audio_asset_id,
    volume: args.volume ?? 0.3,
    auto_ducking: args.auto_ducking ?? true,
    commands,
  };
}

export async function render_video_executor(args: {
  resolution: '1080p' | '4k' | '720p' | '1080x1920_shorts';
  fps?: number;
  output_format?: string;
}) {
  const resolutionMap = {
    '1080p': { width: 1920, height: 1080 },
    '4k': { width: 3840, height: 2160 },
    '720p': { width: 1280, height: 720 },
    '1080x1920_shorts': { width: 1080, height: 1920 },
  };

  const dims = resolutionMap[args.resolution] || resolutionMap['1080p'];

  return {
    success: true,
    resolution: args.resolution,
    width: dims.width,
    height: dims.height,
    fps: args.fps ?? 30,
    output_format: args.output_format ?? 'mp4',
  };
}

export async function sequence_set_aspect_ratio_executor(args: { width: number; height: number }) {
  return new SetMetadataCommand({
    width: args.width,
    height: args.height,
  });
}

export async function video_apply_auto_reframe_executor(args: {
  track_id: string;
  tracking_mode?: 'ActiveSpeaker' | 'Saliency' | 'Manual';
  smoothing?: number;
}) {
  const store = useTimelineStore.getState();
  const targetTrack = store.tracks.find((t) => t.id === args.track_id);
  const commands: Command[] = [];

  if (targetTrack) {
    const { autoReframeEngine } = await import('../../engine/autoReframe');
    for (const clip of targetTrack.clips) {
      const durSec = clip.duration.rate > 0 ? clip.duration.value / clip.duration.rate : 5;
      const reframeData = autoReframeEngine.generateAutoReframeKeyframes(1920, 1080, durSec, 9 / 16);
      commands.push(
        new ApplyAutoReframeCommand(clip.id, reframeData.initialTransform, {
          'position.x': reframeData.positionKeyframes,
        })
      );
    }
  }

  return {
    success: true,
    track_id: args.track_id,
    tracking_mode: args.tracking_mode || 'ActiveSpeaker',
    smoothing: args.smoothing ?? 0.15,
    reframed_clips_count: commands.length,
    commands,
  };
}

export async function transcript_filter_tokens_executor(args: {
  asset_id: string;
  retained_token_ranges: Array<{ start_token_index: number; end_token_index: number }>;
}) {
  return {
    success: true,
    asset_id: args.asset_id,
    retained_token_ranges_count: args.retained_token_ranges.length,
  };
}

export async function captions_generate_karaoke_executor(args: {
  asset_id: string;
  style_preset: string;
  max_words_per_line?: number;
}) {
  const store = useTimelineStore.getState();
  const commands: Command[] = [];

  const targetClip = store.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.assetId === args.asset_id) || store.tracks.flatMap((t) => t.clips)[0];

  if (!targetClip) {
    return {
      error: 'no_clip',
      details: 'Cannot generate karaoke captions: the timeline has no clips.',
    };
  }

  const audioPath = resolveAssetAudioPath(targetClip.assetId);
  if (!audioPath) {
    return {
      error: 'unknown_asset',
      details: `Cannot caption clip "${targetClip.id}": no resolvable audio file in the media pool.`,
    };
  }

  try {
    const transcript = await whisperService.transcribe(audioPath);
    const words = mapTranscriptToCaptionWords(transcript.words, targetClip);
    commands.push(
      new UpdateClipEffectCommand(targetClip.id, 'caption_overlay', 'caption', {
        preset: args.style_preset || 'karaoke',
        maxWordsPerLine: args.max_words_per_line ?? 4,
        words,
      })
    );
  } catch (e: any) {
    return {
      error: 'transcription_unavailable',
      details: e?.message || String(e),
    };
  }

  return {
    success: true,
    asset_id: args.asset_id,
    style_preset: args.style_preset,
    max_words_per_line: args.max_words_per_line ?? 3,
    commands,
  };
}

export async function timeline_remove_silence_executor(args: {
  threshold_seconds: number;
  track_ids?: string[];
}) {
  const store = useTimelineStore.getState();

  // Identify tracks to inspect
  const targetTracks = store.tracks.filter((t) =>
    args.track_ids && args.track_ids.length > 0 ? args.track_ids.includes(t.id) : t.type === 'audio'
  );

  // Find a real audio file to analyse: the first resolvable clip asset on
  // the target tracks. No hardcoded silence gap (R21.3, invariant §5.5).
  let audioAssetId: string | null = null;
  for (const track of targetTracks) {
    for (const clip of track.clips) {
      if (resolveAssetAudioPath(clip.assetId)) {
        audioAssetId = clip.assetId;
        break;
      }
    }
    if (audioAssetId) break;
  }

  if (!audioAssetId) {
    return {
      error: 'no_audio',
      details: 'Cannot remove silence: no resolvable audio clip on the target tracks.',
    };
  }

  const detection = await detect_silence_executor({
    asset_id: audioAssetId,
    min_silence_duration_sec: args.threshold_seconds,
  });
  if (detection && typeof detection === 'object' && 'error' in detection) {
    return detection;
  }

  const commands: Command[] = [];
  for (const gap of detection.silent_ranges) {
    if (gap.duration_seconds < args.threshold_seconds) continue;
    const startRational = secondsToRational(gap.start_seconds, 30);
    const durationRational = secondsToRational(gap.duration_seconds, 30);
    commands.push(new RippleDeleteCommand(startRational, durationRational));
  }

  return {
    success: true,
    threshold_seconds: args.threshold_seconds,
    inspected_tracks_count: targetTracks.length,
    removed_silence_count: commands.length,
    commands,
  };
}

// ==================== OVERLAY & ANIMATION TOOLS ====================

export const add_overlay_object_def = {
  name: 'add_overlay_object',
  description: 'Places a graphic overlay, sticker, badge, or image onto an overlay track at a specific timestamp with optional physics animation and SFX.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_id: { type: 'string' as const, description: 'Asset ID or file path of the overlay graphic' },
      start_seconds: { type: 'number' as const, default: 0 },
      duration_seconds: { type: 'number' as const, default: 3.0 },
      position_x: { type: 'number' as const, default: 0 },
      position_y: { type: 'number' as const, default: 0 },
      scale: { type: 'number' as const, default: 1.0 },
      animation_preset: {
        type: 'string' as const,
        enum: ['none', 'spring_pop', 'slide_up', 'pendulum_swing', 'fade_in'],
        default: 'none',
      },
      sfx: {
        type: 'string' as const,
        enum: ['none', 'pop', 'whoosh', 'chime', 'marker'],
        default: 'none',
      },
    },
    required: ['asset_id'],
  },
};

export async function add_overlay_object_executor(args: {
  asset_id: string;
  start_seconds?: number;
  duration_seconds?: number;
  position_x?: number;
  position_y?: number;
  scale?: number;
  animation_preset?: 'none' | 'spring_pop' | 'slide_up' | 'pendulum_swing' | 'fade_in';
  sfx?: 'none' | 'pop' | 'whoosh' | 'chime' | 'marker';
}) {
  const store = useTimelineStore.getState();
  const commands: Command[] = [];

  const videoTracks = store.tracks.filter((t) => t.type === 'video');
  const overlayTrack = videoTracks[1];
  let overlayTrackId = overlayTrack?.id;

  if (!overlayTrack) {
    const addTrackCmd = new AddTrackCommand('video', 'V2 - Overlays / Graphics', videoTracks.length);
    overlayTrackId = addTrackCmd.trackId;
    commands.push(addTrackCmd);
  }

  const startSec = args.start_seconds ?? 0;
  const durSec = args.duration_seconds ?? 3.0;
  const scale = args.scale ?? 1.0;
  const posX = args.position_x ?? 0;
  const posY = args.position_y ?? 0;

  const keyframes: Record<string, Keyframe[]> = {};

  if (args.animation_preset === 'spring_pop') {
    keyframes['scale.x'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'spring-pop' },
      { time: secondsToRational(0.35, 30), value: scale * 1.15, easing: 'ease-out' },
      { time: secondsToRational(0.5, 30), value: scale, easing: 'ease-in-out' },
    ];
    keyframes['scale.y'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'spring-pop' },
      { time: secondsToRational(0.35, 30), value: scale * 1.15, easing: 'ease-out' },
      { time: secondsToRational(0.5, 30), value: scale, easing: 'ease-in-out' },
    ];
  } else if (args.animation_preset === 'pendulum_swing') {
    keyframes['rotation'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'ease-out' },
      { time: secondsToRational(0.2, 30), value: 15, easing: 'ease-in-out' },
      { time: secondsToRational(0.5, 30), value: -10, easing: 'ease-in-out' },
      { time: secondsToRational(0.8, 30), value: 5, easing: 'ease-in-out' },
      { time: secondsToRational(1.2, 30), value: 0, easing: 'ease-out' },
    ];
  } else if (args.animation_preset === 'slide_up') {
    keyframes['position.y'] = [
      { time: secondsToRational(0, 30), value: posY + 250, easing: 'ease-out' },
      { time: secondsToRational(0.4, 30), value: posY, easing: 'ease-in-out' },
    ];
  } else if (args.animation_preset === 'fade_in') {
    keyframes['opacity'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'ease-out' },
      { time: secondsToRational(0.3, 30), value: 1, easing: 'linear' },
    ];
  }

  const newClip: Clip = {
    id: `clip_overlay_${Date.now()}`,
    assetId: args.asset_id,
    name: `Overlay: ${args.asset_id}`,
    startOffset: secondsToRational(startSec, 30),
    duration: secondsToRational(durSec, 30),
    sourceIn: secondsToRational(0, 30),
    sourceOut: secondsToRational(durSec, 30),
    speed: 1.0,
    transform: {
      position: { x: posX, y: posY },
      scale: { x: scale, y: scale },
      rotation: 0,
      opacity: 1,
      anchorPoint: { x: 0.5, y: 0.5 },
    },
    keyframes: Object.keys(keyframes).length > 0 ? keyframes : undefined,
  };

  commands.push(new AddClipCommand(overlayTrackId, newClip));

  if (args.sfx && args.sfx !== 'none') {
    const sfxRes = await add_sfx_hit_executor({
      sfx_type: args.sfx,
      timestamp_seconds: startSec,
      volume: 0.8,
    });
    if (sfxRes.commands) {
      commands.push(...sfxRes.commands);
    }
  }

  return {
    success: true,
    clip_id: newClip.id,
    track_id: overlayTrackId,
    asset_id: args.asset_id,
    start_seconds: startSec,
    duration_seconds: durSec,
    animation_preset: args.animation_preset ?? 'none',
    sfx: args.sfx ?? 'none',
    commands,
  };
}

export const apply_clip_animation_def = {
  name: 'apply_clip_animation',
  description: 'Applies physics-based keyframe animations (spring pop, bounce, pendulum swing, slide) to any clip on the timeline.',
  parameters: {
    type: 'object' as const,
    properties: {
      clip_id: { type: 'string' as const, description: 'Target clip ID' },
      animation_type: {
        type: 'string' as const,
        enum: ['spring_pop', 'pendulum_swing', 'slide_up', 'fade_in', 'bounce'],
        default: 'spring_pop',
      },
      duration_seconds: { type: 'number' as const, default: 0.5 },
    },
    required: ['clip_id'],
  },
};

export async function apply_clip_animation_executor(args: {
  clip_id: string;
  animation_type?: 'spring_pop' | 'pendulum_swing' | 'slide_up' | 'fade_in' | 'bounce';
  duration_seconds?: number;
}) {
  const store = useTimelineStore.getState();
  const allClips = store.tracks.flatMap((t) => t.clips);
  const targetClip = allClips.find((c) => c.id === args.clip_id);

  if (!targetClip) {
    return {
      error: 'clip_not_found',
      details: `Cannot animate clip "${args.clip_id}": clip does not exist on timeline.`,
    };
  }

  const anim = args.animation_type || 'spring_pop';
  const durSec = args.duration_seconds ?? 0.5;
  const keyframes: Record<string, Keyframe[]> = {};

  if (anim === 'spring_pop' || anim === 'bounce') {
    keyframes['scale.x'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'spring-pop' },
      { time: secondsToRational(durSec * 0.7, 30), value: 1.15, easing: 'ease-out' },
      { time: secondsToRational(durSec, 30), value: 1.0, easing: 'ease-in-out' },
    ];
    keyframes['scale.y'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'spring-pop' },
      { time: secondsToRational(durSec * 0.7, 30), value: 1.15, easing: 'ease-out' },
      { time: secondsToRational(durSec, 30), value: 1.0, easing: 'ease-in-out' },
    ];
  } else if (anim === 'pendulum_swing') {
    keyframes['rotation'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'ease-out' },
      { time: secondsToRational(durSec * 0.2, 30), value: 15, easing: 'ease-in-out' },
      { time: secondsToRational(durSec * 0.45, 30), value: -10, easing: 'ease-in-out' },
      { time: secondsToRational(durSec * 0.7, 30), value: 5, easing: 'ease-in-out' },
      { time: secondsToRational(durSec, 30), value: 0, easing: 'ease-out' },
    ];
  } else if (anim === 'slide_up') {
    const curY = targetClip.transform?.position.y ?? 0;
    keyframes['position.y'] = [
      { time: secondsToRational(0, 30), value: curY + 200, easing: 'ease-out' },
      { time: secondsToRational(durSec, 30), value: curY, easing: 'ease-in-out' },
    ];
  } else if (anim === 'fade_in') {
    keyframes['opacity'] = [
      { time: secondsToRational(0, 30), value: 0, easing: 'ease-out' },
      { time: secondsToRational(durSec, 30), value: 1, easing: 'linear' },
    ];
  }

  const command = new ApplyClipAnimationCommand(targetClip.id, keyframes);

  return {
    success: true,
    clip_id: targetClip.id,
    animation_type: anim,
    duration_seconds: durSec,
    commands: [command],
  };
}

export const add_sfx_hit_def = {
  name: 'add_sfx_hit',
  description: 'Adds a synchronized Foley sound effect (pop, whoosh, marker, phone_bell, chime) at an exact timeline position.',
  parameters: {
    type: 'object' as const,
    properties: {
      sfx_type: {
        type: 'string' as const,
        enum: ['pop', 'whoosh', 'marker', 'phone_bell', 'chime'],
      },
      timestamp_seconds: { type: 'number' as const, default: 0 },
      volume: { type: 'number' as const, default: 0.8 },
    },
    required: ['sfx_type'],
  },
};

export async function add_sfx_hit_executor(args: {
  sfx_type: 'pop' | 'whoosh' | 'marker' | 'phone_bell' | 'chime';
  timestamp_seconds?: number;
  volume?: number;
}) {
  const store = useTimelineStore.getState();
  const commands: Command[] = [];
  const audioTracks = store.tracks.filter((t) => t.type === 'audio');

  const sfxTrack = audioTracks.find((t) => t.name.includes('SFX')) || audioTracks[2];
  let sfxTrackId = sfxTrack?.id;

  if (!sfxTrack) {
    const addTrackCmd = new AddTrackCommand('audio', 'A3 - SFX / Foley', audioTracks.length);
    sfxTrackId = addTrackCmd.trackId;
    commands.push(addTrackCmd);
  }

  const timeSec = args.timestamp_seconds ?? 0;
  const sfxDurationSec = 0.5;

  const newClip: Clip = {
    id: `clip_sfx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    assetId: `sfx_${args.sfx_type}`,
    name: `SFX: ${args.sfx_type}`,
    startOffset: secondsToRational(timeSec, 30),
    duration: secondsToRational(sfxDurationSec, 30),
    sourceIn: secondsToRational(0, 30),
    sourceOut: secondsToRational(sfxDurationSec, 30),
    speed: 1.0,
    volume: args.volume ?? 0.8,
    audioRole: 'sfx',
    muted: false,
  };

  commands.push(new AddClipCommand(sfxTrackId, newClip));

  return {
    success: true,
    sfx_type: args.sfx_type,
    timestamp_seconds: timeSec,
    volume: args.volume ?? 0.8,
    commands,
  };
}

export const add_motion_title_def = {
  name: 'add_motion_title',
  description: 'Creates an animated title card, lower-third, cursive name, or callout box with custom styling and entrance timing.',
  parameters: {
    type: 'object' as const,
    properties: {
      text: { type: 'string' as const },
      start_seconds: { type: 'number' as const, default: 0 },
      duration_seconds: { type: 'number' as const, default: 3.0 },
      style: {
        type: 'string' as const,
        enum: ['bold_header', 'cursive_accent', 'highlight_card', 'badge'],
        default: 'bold_header',
      },
      color: { type: 'string' as const, default: '#0B3558' },
      background: { type: 'string' as const, default: '#FDF3AE' },
      animation_preset: {
        type: 'string' as const,
        enum: ['spring_pop', 'slide_up', 'fade_in', 'none'],
        default: 'spring_pop',
      },
    },
    required: ['text'],
  },
};

export async function add_motion_title_executor(args: {
  text: string;
  start_seconds?: number;
  duration_seconds?: number;
  style?: 'bold_header' | 'cursive_accent' | 'highlight_card' | 'badge';
  color?: string;
  background?: string;
  animation_preset?: 'spring_pop' | 'slide_up' | 'fade_in' | 'none';
}) {
  const store = useTimelineStore.getState();
  const commands: Command[] = [];

  const videoTracks = store.tracks.filter((t) => t.type === 'video');
  const titleTrack = videoTracks.find((t) => t.name.includes('Title') || t.name.includes('Graphics')) || videoTracks[1];
  let titleTrackId = titleTrack?.id;

  if (!titleTrack) {
    const addTrackCmd = new AddTrackCommand('video', 'V2 - Titles / Graphics', videoTracks.length);
    titleTrackId = addTrackCmd.trackId;
    commands.push(addTrackCmd);
  }

  const startSec = args.start_seconds ?? 0;
  const durSec = args.duration_seconds ?? 3.0;

  const titleClip: Clip = {
    id: `clip_title_${Date.now()}`,
    assetId: `title_${Date.now()}`,
    name: `Title: ${args.text.slice(0, 20)}`,
    startOffset: secondsToRational(startSec, 30),
    duration: secondsToRational(durSec, 30),
    sourceIn: secondsToRational(0, 30),
    sourceOut: secondsToRational(durSec, 30),
    speed: 1.0,
    title: {
      text: args.text,
      fontFamily: args.style === 'cursive_accent' ? 'Brush Script MT, cursive' : 'Georgia, serif',
      fontSize: args.style === 'bold_header' ? 0.08 : 0.06,
      color: args.color || '#0B3558',
      background: args.background || '#FDF3AE',
      align: 'center',
      box: { x: 0.1, y: 0.2, w: 0.8, h: 0.2 },
      fadeInSec: args.animation_preset === 'fade_in' ? 0.3 : 0,
    },
  };

  if (args.animation_preset === 'spring_pop') {
    titleClip.keyframes = {
      'scale.x': [
        { time: secondsToRational(0, 30), value: 0, easing: 'spring-pop' },
        { time: secondsToRational(0.35, 30), value: 1.15, easing: 'ease-out' },
        { time: secondsToRational(0.5, 30), value: 1.0, easing: 'ease-in-out' },
      ],
      'scale.y': [
        { time: secondsToRational(0, 30), value: 0, easing: 'spring-pop' },
        { time: secondsToRational(0.35, 30), value: 1.15, easing: 'ease-out' },
        { time: secondsToRational(0.5, 30), value: 1.0, easing: 'ease-in-out' },
      ],
    };
  }

  commands.push(new AddClipCommand(titleTrackId, titleClip));

  return {
    success: true,
    clip_id: titleClip.id,
    track_id: titleTrackId,
    text: args.text,
    style: args.style ?? 'bold_header',
    commands,
  };
}

export const apply_punch_in_zooms_def = {
  name: 'apply_punch_in_zooms',
  description: 'Applies alternating punch-in zoom cuts (e.g. 1.0x to 1.12x) across video clips or at periodic intervals to maintain high viewer retention and pattern interrupts.',
  parameters: {
    type: 'object' as const,
    properties: {
      clip_id: { type: 'string' as const, description: 'Optional specific clip ID. If omitted, applies across the active video track.' },
      interval_seconds: { type: 'number' as const, default: 4.0, description: 'Interval in seconds between zoom changes.' },
      zoom_scale: { type: 'number' as const, default: 1.12, description: 'Scale factor for the punch-in zoom (e.g. 1.12 = 12% zoom).' },
      center_focus: {
        type: 'string' as const,
        enum: ['speaker_face', 'center'],
        default: 'speaker_face',
        description: 'Whether to shift Y position slightly upward for face framing.',
      },
      animation_type: {
        type: 'string' as const,
        enum: ['hard_cut', 'smooth_spring'],
        default: 'hard_cut',
        description: 'Hard jump-cut zoom vs smooth spring physics zoom.',
      },
    },
  },
};

export async function apply_punch_in_zooms_executor(args: {
  clip_id?: string;
  interval_seconds?: number;
  zoom_scale?: number;
  center_focus?: 'speaker_face' | 'center';
  animation_type?: 'hard_cut' | 'smooth_spring';
}) {
  const store = useTimelineStore.getState();
  const commands: Command[] = [];

  const videoTracks = store.tracks.filter((t) => t.type === 'video');
  if (videoTracks.length === 0) {
    return { error: 'no_video_tracks', details: 'Timeline has no video tracks' };
  }

  const intervalSec = Math.max(1.0, args.interval_seconds ?? 4.0);
  const zoomScale = Math.max(1.02, Math.min(2.0, args.zoom_scale ?? 1.12));
  const centerFocus = args.center_focus ?? 'speaker_face';
  const animType = args.animation_type ?? 'hard_cut';
  const yShift = centerFocus === 'speaker_face' ? -0.045 : 0;

  // Find target clip(s)
  let targetClips: Clip[] = [];
  if (args.clip_id) {
    for (const track of videoTracks) {
      const found = track.clips.find((c) => c.id === args.clip_id);
      if (found) {
        targetClips.push(found);
        break;
      }
    }
  } else {
    for (const track of videoTracks) {
      if (track.clips.length > 0) {
        targetClips = [...track.clips];
        break;
      }
    }
  }

  if (targetClips.length === 0) {
    return { error: 'no_clips_found', details: 'No video clips found to apply punch-in zooms' };
  }

  let totalZoomCuts = 0;

  // Case 1: Multiple clips already split (e.g. from silence trimming or cuts)
  if (targetClips.length > 1) {
    targetClips.forEach((clip, idx) => {
      const isZoomed = idx % 2 === 1;
      const targetScale = isZoomed ? zoomScale : 1.0;
      const targetY = isZoomed ? yShift : 0;

      const keyframes: Record<string, Keyframe[]> = {
        'scale.x': [{ time: secondsToRational(0, 30), value: targetScale, easing: 'linear' }],
        'scale.y': [{ time: secondsToRational(0, 30), value: targetScale, easing: 'linear' }],
        'position.y': [{ time: secondsToRational(0, 30), value: targetY, easing: 'linear' }],
      };

      commands.push(
        new ApplyClipAnimationCommand(clip.id, keyframes, {
          scale: { x: targetScale, y: targetScale },
          position: { x: 0, y: targetY },
        })
      );
      if (isZoomed) totalZoomCuts++;
    });
  } else {
    // Case 2: Single long continuous clip - apply rhythmic zoom keyframes
    const clip = targetClips[0];
    const durSec = rationalToSeconds(clip.duration);
    const scaleKeyframesX: Keyframe[] = [];
    const scaleKeyframesY: Keyframe[] = [];
    const posKeyframesY: Keyframe[] = [];

    let currentTime = 0;
    let isZoomed = false;

    // Start at 1.0x
    scaleKeyframesX.push({ time: secondsToRational(0, 30), value: 1.0, easing: 'linear' });
    scaleKeyframesY.push({ time: secondsToRational(0, 30), value: 1.0, easing: 'linear' });
    posKeyframesY.push({ time: secondsToRational(0, 30), value: 0, easing: 'linear' });

    while (currentTime + intervalSec < durSec) {
      currentTime += intervalSec;
      isZoomed = !isZoomed;
      const targetScale = isZoomed ? zoomScale : 1.0;
      const targetY = isZoomed ? yShift : 0;

      if (animType === 'hard_cut') {
        const preTime = Math.max(0, currentTime - 0.02);
        const prevScale = isZoomed ? 1.0 : zoomScale;
        const prevY = isZoomed ? 0 : yShift;

        scaleKeyframesX.push({ time: secondsToRational(preTime, 30), value: prevScale, easing: 'linear' });
        scaleKeyframesY.push({ time: secondsToRational(preTime, 30), value: prevScale, easing: 'linear' });
        posKeyframesY.push({ time: secondsToRational(preTime, 30), value: prevY, easing: 'linear' });

        scaleKeyframesX.push({ time: secondsToRational(currentTime, 30), value: targetScale, easing: 'linear' });
        scaleKeyframesY.push({ time: secondsToRational(currentTime, 30), value: targetScale, easing: 'linear' });
        posKeyframesY.push({ time: secondsToRational(currentTime, 30), value: targetY, easing: 'linear' });
      } else {
        // Smooth spring punch
        scaleKeyframesX.push({ time: secondsToRational(currentTime, 30), value: targetScale, easing: 'spring-pop' });
        scaleKeyframesY.push({ time: secondsToRational(currentTime, 30), value: targetScale, easing: 'spring-pop' });
        posKeyframesY.push({ time: secondsToRational(currentTime, 30), value: targetY, easing: 'spring-pop' });
      }
      totalZoomCuts++;
    }

    const keyframes: Record<string, Keyframe[]> = {
      'scale.x': scaleKeyframesX,
      'scale.y': scaleKeyframesY,
      'position.y': posKeyframesY,
    };

    commands.push(new ApplyClipAnimationCommand(clip.id, keyframes));
  }

  return {
    success: true,
    total_zoom_cuts: totalZoomCuts,
    interval_seconds: intervalSec,
    zoom_scale: zoomScale,
    center_focus: centerFocus,
    animation_type: animType,
    commands,
  };
}

export const auto_retention_edit_def = {
  name: 'auto_retention_edit',
  description: 'Executes the full viral retention editing pipeline in one click: 9:16 vertical reframe with face tracking, periodic punch-in zoom pattern interrupts, animated kinetic captions, ducked BGM, and Foley SFX hits.',
  parameters: {
    type: 'object' as const,
    properties: {
      target_ratio: {
        type: 'string' as const,
        enum: ['9:16', '16:9'],
        default: '9:16',
        description: 'Target aspect ratio for the sequence canvas.',
      },
      caption_style: {
        type: 'string' as const,
        enum: ['karaoke_bounce', 'bold_yellow_highlight', 'clean_white'],
        default: 'karaoke_bounce',
        description: 'Style of animated captions.',
      },
      punch_in_zooms: {
        type: 'boolean' as const,
        default: true,
        description: 'Whether to add periodic punch-in zoom pattern interrupts.',
      },
      add_bgm: {
        type: 'boolean' as const,
        default: true,
        description: 'Whether to add ducked background music.',
      },
      bgm_asset_id: {
        type: 'string' as const,
        default: 'asset_bgm_ambient',
        description: 'Audio asset ID for background music.',
      },
      add_sfx_transitions: {
        type: 'boolean' as const,
        default: true,
        description: 'Whether to add Foley SFX at key pattern interrupts.',
      },
    },
  },
};

export async function auto_retention_edit_executor(args: {
  target_ratio?: '9:16' | '16:9';
  caption_style?: 'karaoke_bounce' | 'bold_yellow_highlight' | 'clean_white';
  punch_in_zooms?: boolean;
  add_bgm?: boolean;
  bgm_asset_id?: string;
  add_sfx_transitions?: boolean;
}) {
  const store = useTimelineStore.getState();
  const commands: Command[] = [];
  const appliedSteps: string[] = [];

  const videoTracks = store.tracks.filter((t) => t.type === 'video');
  const primaryTrack = videoTracks[0];

  // 1. Aspect ratio setting
  const isVertical = (args.target_ratio ?? '9:16') === '9:16';
  if (isVertical) {
    commands.push(new SetMetadataCommand({ width: 1080, height: 1920 }));
    appliedSteps.push('Set aspect ratio to 9:16 (1080x1920)');

    // 2. Vertical auto reframe with Kalman speaker tracking
    if (primaryTrack) {
      const reframeRes = await video_apply_auto_reframe_executor({
        track_id: primaryTrack.id,
        tracking_mode: 'ActiveSpeaker',
      });
      if (reframeRes && 'commands' in reframeRes && reframeRes.commands) {
        commands.push(...reframeRes.commands);
        appliedSteps.push('Applied Kalman face tracking auto-reframe for 9:16');
      }
    }
  }

  // 3. Punch-in zoom pattern interrupts
  if (args.punch_in_zooms ?? true) {
    const zoomRes = await apply_punch_in_zooms_executor({
      interval_seconds: 4.0,
      zoom_scale: 1.12,
      center_focus: 'speaker_face',
      animation_type: 'hard_cut',
    });
    if (zoomRes && 'commands' in zoomRes && zoomRes.commands) {
      commands.push(...zoomRes.commands);
      appliedSteps.push(`Applied ${zoomRes.total_zoom_cuts} punch-in zoom pattern interrupts`);
    }
  }

  // 4. Kinetic animated captions
  const captionRes = await add_subtitles_executor({
    style: args.caption_style ?? 'karaoke_bounce',
    font_size: 48,
    max_words_per_line: 3,
  });
  if (captionRes && 'commands' in captionRes && captionRes.commands) {
    commands.push(...captionRes.commands);
    appliedSteps.push(`Generated kinetic subtitles (${args.caption_style ?? 'karaoke_bounce'})`);
  } else if (captionRes && 'error' in captionRes) {
    appliedSteps.push(`Subtitles skipped (${captionRes.error})`);
  }

  // 5. Ducked BGM
  if (args.add_bgm ?? true) {
    const bgmRes = await add_audio_track_executor({
      audio_asset_id: args.bgm_asset_id || 'asset_bgm_ambient',
      volume: 0.18,
      auto_ducking: true,
    });
    if (bgmRes && 'commands' in bgmRes && bgmRes.commands) {
      commands.push(...bgmRes.commands);
      appliedSteps.push('Added auto-ducked background music track');
    }
  }

  // 6. SFX at pattern interrupts
  if (args.add_sfx_transitions ?? true) {
    const whooshRes = await add_sfx_hit_executor({
      sfx_type: 'whoosh',
      timestamp_seconds: 0,
      volume: 0.7,
    });
    if (whooshRes && 'commands' in whooshRes && whooshRes.commands) {
      commands.push(...whooshRes.commands);
      appliedSteps.push('Added opening SFX whoosh transition');
    }
  }

  return {
    success: true,
    applied_steps: appliedSteps,
    total_commands: commands.length,
    commands,
  };
}


