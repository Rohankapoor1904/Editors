/**
 * Social Platform & Broadcast Export Presets (Task R18.2)
 * Pre-calibrated specifications for YouTube 4K, TikTok/Reels, Broadcast, and ProRes
 * including ITU-R BS.1770 LUFS loudness targets and Rec.709 colorimetry tags.
 */

import { ExportPresetConfig } from './exportEngine';

export interface SocialPreset {
  id: string;
  name: string;
  platform: 'youtube' | 'tiktok' | 'broadcast' | 'prores';
  category: string;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
  targetLufs: number; // e.g. -14 LUFS for YouTube/TikTok, -24 LUFS for Broadcast
  colorSpace: 'bt709' | 'bt2020';
  colorPrimaries: string;
  colorTrc: string;
  audioBitrateKbps: number;
  aspectRatio: '16:9' | '9:16';
  badge: string;
  description: string;
}

export const SOCIAL_PRESETS: SocialPreset[] = [
  {
    id: 'youtube_4k',
    name: 'YouTube 4K UHD',
    platform: 'youtube',
    category: 'Web & Streaming',
    width: 3840,
    height: 2160,
    fps: 59.94,
    bitrateMbps: 60,
    targetLufs: -14.0,
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTrc: 'bt709',
    audioBitrateKbps: 384,
    aspectRatio: '16:9',
    badge: '4K 60fps',
    description: 'YouTube 4K UHD Rec.709 with -14 LUFS loudness normalization',
  },
  {
    id: 'tiktok_reels',
    name: 'TikTok / Reels / Shorts',
    platform: 'tiktok',
    category: 'Social Vertical',
    width: 1080,
    height: 1920,
    fps: 30.0,
    bitrateMbps: 25,
    targetLufs: -14.0,
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTrc: 'bt709',
    audioBitrateKbps: 256,
    aspectRatio: '9:16',
    badge: '9:16 Vertical',
    description: 'Optimized vertical social feed with punchy -14 LUFS dialogue',
  },
  {
    id: 'broadcast_1080p',
    name: 'Broadcast Television (EBU R128)',
    platform: 'broadcast',
    category: 'Broadcast & Delivery',
    width: 1920,
    height: 1080,
    fps: 29.97,
    bitrateMbps: 50,
    targetLufs: -24.0,
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTrc: 'bt709',
    audioBitrateKbps: 384,
    aspectRatio: '16:9',
    badge: 'EBU -24 LUFS',
    description: 'Strict broadcast standard compliant with EBU R128 and ATSC A/85',
  },
  {
    id: 'prores_422_hq',
    name: 'Apple ProRes 422 HQ Master',
    platform: 'prores',
    category: 'Archive & Master',
    width: 3840,
    height: 2160,
    fps: 24.0,
    bitrateMbps: 220,
    targetLufs: -24.0,
    colorSpace: 'bt709',
    colorPrimaries: 'bt709',
    colorTrc: 'bt709',
    audioBitrateKbps: 384,
    aspectRatio: '16:9',
    badge: 'Master Archive',
    description: '10-bit visually lossless ProRes master for archival grade finishing',
  },
];

export function getPresetById(id: string): SocialPreset | undefined {
  return SOCIAL_PRESETS.find((p) => p.id === id);
}

/**
 * R26.5 — typed publish-compatibility error.
 * Raised when a master's aspect/frame geometry is unsafe for the target preset.
 */
export class PublishCompatibilityError extends Error {
  readonly code: 'ASPECT_MISMATCH' | 'SIZE_MISMATCH';
  readonly master: { width: number; height: number };
  readonly presetId: string;
  readonly presetAspect: string;

  constructor(
    code: 'ASPECT_MISMATCH' | 'SIZE_MISMATCH',
    master: { width: number; height: number },
    preset: SocialPreset,
    message: string
  ) {
    super(message);
    this.name = 'PublishCompatibilityError';
    this.code = code;
    this.master = master;
    this.presetId = preset.id;
    this.presetAspect = preset.aspectRatio;
  }
}

function aspectBucket(width: number, height: number): '16:9' | '9:16' | 'square' | 'other' {
  if (width <= 0 || height <= 0) return 'other';
  const r = width / height;
  if (Math.abs(r - 16 / 9) < 0.02) return '16:9';
  if (Math.abs(r - 9 / 16) < 0.02) return '9:16';
  if (Math.abs(r - 1) < 0.02) return 'square';
  return 'other';
}

/**
 * R26.5 — 1-click publish gate: rejects a vertical master for a landscape-only
 * preset (and the inverse) with a typed PublishCompatibilityError before any
 * encode work starts. Square masters are allowed into either bucket (safe
 * crop/pad is a downstream transform, not a silent aspect lie).
 */
export function assertPublishCompatible(
  master: { width: number; height: number },
  preset: SocialPreset
): void {
  if (!master || !Number.isFinite(master.width) || !Number.isFinite(master.height) || master.width <= 0 || master.height <= 0) {
    throw new PublishCompatibilityError(
      'SIZE_MISMATCH',
      master ?? { width: 0, height: 0 },
      preset,
      `Master has invalid geometry ${master?.width}x${master?.height}`
    );
  }
  const masterAspect = aspectBucket(master.width, master.height);
  if (masterAspect === 'square' || masterAspect === 'other') return;

  const presetIsLandscape = preset.aspectRatio === '16:9';
  const masterIsLandscape = masterAspect === '16:9';
  if (presetIsLandscape !== masterIsLandscape) {
    throw new PublishCompatibilityError(
      'ASPECT_MISMATCH',
      master,
      preset,
      `Master ${master.width}x${master.height} (${masterAspect}) is incompatible with preset ` +
        `'${preset.name}' (${preset.aspectRatio}). Choose a matching-aspect preset or reframe first.`
    );
  }
}

/**
 * Builds standard FFmpeg arguments for colorimetry and audio loudness normalization
 */
export function buildColorAndAudioFFmpegArgs(preset: SocialPreset): string[] {
  const args: string[] = [
    // Colorimetry metadata tagging
    '-colorspace', preset.colorSpace,
    '-color_primaries', preset.colorPrimaries,
    '-color_trc', preset.colorTrc,
  ];

  // ITU-R BS.1770 compliant loudness normalization filter
  args.push('-af', `loudnorm=I=${preset.targetLufs}:TP=-1.5:LRA=11`);

  return args;
}

/**
 * Converts a social preset into an ExportPresetConfig
 */
export function createExportConfigFromPreset(
  preset: SocialPreset,
  encoder: string,
  outputPath?: string
): ExportPresetConfig {
  const cleanName = preset.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    presetName: preset.name as any,
    width: preset.width,
    height: preset.height,
    fps: preset.fps,
    bitrateMbps: preset.bitrateMbps,
    encoder,
    outputPath: outputPath || `/exports/${cleanName}.mp4`,
    targetLufs: preset.targetLufs,
    colorSpace: preset.colorSpace,
    aspectRatio: preset.aspectRatio,
  };
}
