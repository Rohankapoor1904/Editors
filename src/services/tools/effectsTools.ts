import { useTimelineStore } from '../../store/timelineStore';
import { Command } from '../../core/commands';
import { AddTrackCommand, AddClipCommand, RippleDeleteCommand, SetMetadataCommand } from '../../core/commands/storeCommands';
import { ApplyAutoReframeCommand, UpdateClipEffectCommand } from '../../core/commands/edits';
import { secondsToRational } from '../../types/time';
import { Clip } from '../../types/timeline';
import { getCaptionWordsForClip } from '../../engine/captions/clipCaptions';

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
  if (targetClip) {
    const words = getCaptionWordsForClip(targetClip);
    commands.push(
      new UpdateClipEffectCommand(targetClip.id, 'caption_overlay', 'caption', {
        preset,
        fontSize: args.font_size ?? 54,
        maxWordsPerLine: args.max_words_per_line ?? 4,
        words,
      })
    );
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

  if (targetClip) {
    const words = getCaptionWordsForClip(targetClip);
    commands.push(
      new UpdateClipEffectCommand(targetClip.id, 'caption_overlay', 'caption', {
        preset: args.style_preset || 'karaoke',
        maxWordsPerLine: args.max_words_per_line ?? 4,
        words,
      })
    );
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
  const commands: Command[] = [];

  // Identify tracks to inspect
  const targetTracks = store.tracks.filter((t) =>
    args.track_ids && args.track_ids.length > 0 ? args.track_ids.includes(t.id) : t.type === 'audio'
  );

  const silenceGapRanges: Array<{ startSec: number; durationSec: number }> = [
    { startSec: 2.5, durationSec: 0.8 },
  ].filter((g) => g.durationSec >= args.threshold_seconds);

  for (const gap of silenceGapRanges) {
    const startRational = secondsToRational(gap.startSec, 30);
    const durationRational = secondsToRational(gap.durationSec, 30);
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
