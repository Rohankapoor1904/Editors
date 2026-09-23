import { useTimelineStore } from '../../store/timelineStore';
import { useMediaPoolStore } from '../../store/mediaPool';
import { nativeBridge } from '../nativeBridge';
import { whisperService } from '../whisperTranscriber';
import { sileroVadService } from '../sileroVad';
import { Command } from '../../core/commands';
import { AddClipCommand } from '../../core/commands/storeCommands';
import { secondsToRational, rationalToSeconds } from '../../types/time';
import { Clip } from '../../types/timeline';
import { runAutoEdit, defaultPerceptionServices, RawFootage } from '../../engine/autoEdit/autoEditPipeline';
import { parseAssetDuration } from '../../core/project/serialize';

/**
 * Resolves an asset id / name / path to a real on-disk audio path via the
 * media pool (falling back to timeline clip references). Returns `null`
 * when nothing real resolves — callers must return a typed error rather
 * than inventing transcript/silence data (R21.3, invariant §5.5).
 */
export function resolveAssetAudioPath(assetId: string): string | null {
  const poolAssets = useMediaPoolStore.getState().assets;
  const direct = poolAssets.find(
    (a) => a.id === assetId || a.name === assetId || a.path === assetId
  );
  if (direct && direct.path && !direct.isOffline) {
    return direct.path;
  }

  const timelineState = useTimelineStore.getState();
  for (const track of timelineState.tracks) {
    const clip = track.clips.find((c) => c.id === assetId || c.assetId === assetId);
    if (clip) {
      const poolAsset = poolAssets.find((a) => a.id === clip.assetId);
      if (poolAsset && poolAsset.path && !poolAsset.isOffline) {
        return poolAsset.path;
      }
      // A clip reference with no pool entry has no resolvable file path.
      return null;
    }
  }

  return null;
}

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

export async function probe_media_executor(args: { asset_id: string }) {
  const poolAssets = useMediaPoolStore.getState().assets;
  const poolAsset = poolAssets.find(
    (a) => a.id === args.asset_id || a.name === args.asset_id || a.path === args.asset_id
  );

  if (poolAsset) {
    let dur = 10;
    if (poolAsset.duration) {
      const parts = poolAsset.duration.split(':').map(Number);
      if (parts.length === 3) {
        dur = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    const fps = poolAsset.fps ? parseFloat(poolAsset.fps) || 30 : 30;
    let width = 1920;
    let height = 1080;
    if (poolAsset.resolution) {
      const res = poolAsset.resolution.split('x').map(Number);
      if (res.length === 2 && res[0] > 0 && res[1] > 0) {
        width = res[0];
        height = res[1];
      }
    }

    return {
      asset_id: poolAsset.id,
      name: poolAsset.name,
      duration: dur,
      width,
      height,
      fps,
      channels: poolAsset.type === 'video' || poolAsset.type === 'audio' ? 2 : 0,
      sampleRate: 48000,
    };
  }

  // Check clips on timeline
  const timelineState = useTimelineStore.getState();
  for (const track of timelineState.tracks) {
    const clip = track.clips.find((c) => c.id === args.asset_id || c.assetId === args.asset_id);
    if (clip) {
      const dur = clip.duration.rate > 0 ? clip.duration.value / clip.duration.rate : 5;
      return {
        asset_id: clip.assetId,
        clip_id: clip.id,
        name: clip.name,
        duration: dur,
        width: 1920,
        height: 1080,
        fps: clip.duration.rate || 30,
        channels: 2,
        sampleRate: 48000,
      };
    }
  }

  // Attempt native probe if running in Tauri desktop environment
  try {
    const probe = await nativeBridge.importMediaFile(args.asset_id);
    if (probe) {
      return {
        asset_id: args.asset_id,
        duration: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        channels: probe.hasAudio ? 2 : 0,
        sampleRate: probe.sampleRate || 48000,
      };
    }
  } catch (_e) {
    // No real source for this asset — report honestly instead of
    // fabricating 1920x1080 / 15s metadata (R21.3, invariant §5.5).
  }
  return {
    error: 'unknown_asset',
    details: `No media pool asset or timeline clip matches "${args.asset_id}", and native probing is unavailable in this environment.`,
  };
}

export async function transcribe_and_align_executor(args: { asset_id: string; language?: string }) {
  const audioPath = resolveAssetAudioPath(args.asset_id);
  if (!audioPath) {
    return {
      error: 'unknown_asset',
      details: `Cannot transcribe "${args.asset_id}": no resolvable audio file in the media pool or timeline.`,
    };
  }

  try {
    const transcript = await whisperService.transcribe(audioPath);
    return {
      asset_id: args.asset_id,
      language: args.language || 'auto',
      words: transcript.words.map((w) => ({
        word: w.word,
        start: w.startTime,
        end: w.endTime,
        confidence: w.confidence,
      })),
    };
  } catch (e: any) {
    return {
      error: 'transcription_unavailable',
      details: e?.message || String(e),
    };
  }
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

export async function detect_silence_executor(args: {
  asset_id: string;
  noise_threshold_db?: number;
  min_silence_duration_sec?: number;
}) {
  const threshold = args.noise_threshold_db ?? -30;
  const minDuration = args.min_silence_duration_sec ?? 0.5;

  const audioPath = resolveAssetAudioPath(args.asset_id);
  if (!audioPath) {
    return {
      error: 'unknown_asset',
      details: `Cannot detect silence in "${args.asset_id}": no resolvable audio file in the media pool or timeline.`,
    };
  }

  try {
    const segments = await sileroVadService.detectSilence(audioPath, minDuration, threshold);
    return {
      asset_id: args.asset_id,
      noise_threshold_db: threshold,
      min_silence_duration_sec: minDuration,
      silent_ranges: segments.map((s) => ({
        start_seconds: s.startTime,
        end_seconds: s.endTime,
        duration_seconds: s.duration,
      })),
    };
  } catch (e: any) {
    return {
      error: 'vad_unavailable',
      details: e?.message || String(e),
    };
  }
}

export async function cut_and_arrange_timeline_executor(args: {
  track_id?: string;
  edits: Array<{
    asset_id: string;
    start_time: number;
    end_time: number;
    timeline_position?: number;
  }>;
}) {
  const store = useTimelineStore.getState();
  const trackId = args.track_id || store.tracks[0]?.id || 'v1';
  const commands: Command[] = [];

  let currentTimelinePos = 0;

  for (const edit of args.edits) {
    const durationSec = Math.max(0.01, edit.end_time - edit.start_time);
    const startOffsetSec = edit.timeline_position !== undefined ? edit.timeline_position : currentTimelinePos;

    const clipId = `clip_edit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newClip: Clip = {
      id: clipId,
      assetId: edit.asset_id,
      name: `Clip (${edit.start_time.toFixed(1)}s - ${edit.end_time.toFixed(1)}s)`,
      startOffset: secondsToRational(startOffsetSec, 30),
      duration: secondsToRational(durationSec, 30),
      sourceIn: secondsToRational(edit.start_time, 30),
      sourceOut: secondsToRational(edit.end_time, 30),
      speed: 1.0,
      volume: 1.0,
      muted: false,
    };

    commands.push(new AddClipCommand(trackId, newClip));
    currentTimelinePos = startOffsetSec + durationSec;
  }

  return {
    success: true,
    track_id: trackId,
    edits_count: args.edits.length,
    commands,
  };
}

export const auto_edit_assembly_def = {
  name: 'auto_edit_assembly',
  description: 'Assembles a rough cut from raw footage: transcribes, scores takes by speech density and silence, drops bad takes, and inserts keepers as one undoable transaction.',
  parameters: {
    type: 'object' as const,
    properties: {
      asset_ids: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      track_id: { type: 'string' as const },
      quality_threshold: { type: 'number' as const, default: 40 },
      start_at_sec: { type: 'number' as const },
    },
    required: ['asset_ids'],
  },
};

/**
 * R25.1 — executes the Auto-Edit pipeline through the real on-device
 * perception services. Unresolvable assets, unparsable durations and
 * perception failures all return typed errors — the executor never
 * invents takes, words, or silence windows (R21.3, invariant §5.5).
 */
export async function auto_edit_assembly_executor(args: {
  asset_ids: string[];
  track_id?: string;
  quality_threshold?: number;
  start_at_sec?: number;
}) {
  const store = useTimelineStore.getState();
  const poolAssets = useMediaPoolStore.getState().assets;
  const fps = store.metadata?.fps || 30;
  const rate = Math.max(1, Math.round(fps));

  if (!Array.isArray(args.asset_ids) || args.asset_ids.length === 0) {
    return {
      error: 'no_footage',
      details: 'auto_edit_assembly needs at least one asset_id; nothing was assembled.',
    };
  }

  const trackId =
    args.track_id || store.tracks.find((t) => t.type === 'video')?.id || store.tracks[0]?.id;
  if (!trackId) {
    return { error: 'no_track', details: 'No timeline track available for the assembly.' };
  }

  const footage: RawFootage[] = [];
  for (const assetId of args.asset_ids) {
    const mediaPath = resolveAssetAudioPath(assetId);
    if (!mediaPath) {
      return {
        error: 'unknown_asset',
        details: `Cannot assemble "${assetId}": no resolvable media file in the pool or timeline.`,
      };
    }
    const poolAsset = poolAssets.find((a) => a.id === assetId || a.name === assetId || a.path === assetId);
    const parsed = poolAsset ? parseAssetDuration(poolAsset.duration, fps) : undefined;
    if (!parsed) {
      return {
        error: 'unknown_duration',
        details: `Cannot assemble "${assetId}": duration "${poolAsset?.duration ?? 'missing'}" is not parseable — refusing to invent a take length.`,
      };
    }
    footage.push({
      assetId: poolAsset?.id ?? assetId,
      assetName: poolAsset?.name ?? assetId,
      mediaPath,
      durationSec: parsed.value / parsed.rate,
    });
  }

  try {
    const result = await runAutoEdit(footage, defaultPerceptionServices, {
      trackId,
      startAtSec: args.start_at_sec ?? rationalToSeconds(store.playheadPosition),
      rate,
      qualityThreshold: args.quality_threshold,
    });
    return {
      success: true,
      track_id: trackId,
      kept: result.kept,
      dropped: result.dropped,
      takes: result.takes.map((t) => ({
        asset_id: t.assetId,
        score: t.score.score,
        verdict: t.score.verdict,
        reasons: t.score.reasons,
      })),
      commands: [result.transaction],
    };
  } catch (e: unknown) {
    return {
      error: 'auto_edit_failed',
      details: e instanceof Error ? e.message : String(e),
    };
  }
}
