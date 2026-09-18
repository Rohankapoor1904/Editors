import { NotImplementedError } from '../runtimeConfig';

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

export async function add_subtitles_executor(_args: any) {
  throw new NotImplementedError('add_subtitles');
}

export async function add_audio_track_executor(_args: any) {
  throw new NotImplementedError('add_audio_track');
}

export async function render_video_executor(_args: any) {
  throw new NotImplementedError('render_video');
}

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

export async function sequence_set_aspect_ratio_executor(_args: any) {
  throw new NotImplementedError('sequence_set_aspect_ratio');
}

export async function video_apply_auto_reframe_executor(_args: any) {
  throw new NotImplementedError('video_apply_auto_reframe');
}

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

export async function transcript_filter_tokens_executor(_args: any) {
  throw new NotImplementedError('transcript_filter_tokens');
}

export async function captions_generate_karaoke_executor(_args: any) {
  throw new NotImplementedError('captions_generate_karaoke');
}

export async function timeline_remove_silence_executor(_args: any) {
  throw new NotImplementedError('timeline_remove_silence');
}
