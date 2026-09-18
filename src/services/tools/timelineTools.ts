import { NotImplementedError } from '../runtimeConfig';

export const probe_media_def = {
  name: 'probe_media',
  description: 'Returns metadata, duration, frame rate, resolution, and audio channels for a given asset path.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_id: { type: 'string' as const, description: 'Asset ID or file path' },
    },
    required: ['asset_id'],
  },
};

export const transcribe_and_align_def = {
  name: 'transcribe_and_align',
  description: 'Generates word-by-word transcript with precise start and end timestamps.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_id: { type: 'string' as const },
      language: { type: 'string' as const, default: 'auto' },
    },
    required: ['asset_id'],
  },
};

export async function probe_media_executor(_args: any) {
  throw new NotImplementedError('probe_media');
}

export async function transcribe_and_align_executor(_args: any) {
  throw new NotImplementedError('transcribe_and_align');
}

export const detect_silence_def = {
  name: 'detect_silence',
  description: 'Scans audio stream and returns array of start/end timestamps of silent segments.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_id: { type: 'string' as const },
      noise_threshold_db: { type: 'number' as const, default: -30 },
      min_silence_duration_sec: { type: 'number' as const, default: 0.5 },
    },
    required: ['asset_id'],
  },
};

export const cut_and_arrange_timeline_def = {
  name: 'cut_and_arrange_timeline',
  description: 'Applies a list of clip edits (trims, cuts, re-ordering) to the main timeline track.',
  parameters: {
    type: 'object' as const,
    properties: {
      track_id: { type: 'string' as const, default: 'main_video' },
      edits: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            asset_id: { type: 'string' as const },
            start_time: { type: 'number' as const },
            end_time: { type: 'number' as const },
            timeline_position: { type: 'number' as const },
          },
          required: ['asset_id', 'start_time', 'end_time'],
        },
      },
    },
    required: ['edits'],
  },
};

export async function detect_silence_executor(_args: any) {
  throw new NotImplementedError('detect_silence');
}

export async function cut_and_arrange_timeline_executor(_args: any) {
  throw new NotImplementedError('cut_and_arrange_timeline');
}
