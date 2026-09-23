import { CaptionPreset } from '../captions/captionEngine';

/**
 * R25.4 — creator template library: trend-matched edit recipes.
 *
 * A template bundles a caption preset, a canvas size, an outro title card
 * and a beat-sync flag. Application writes through REAL paths only: canvas
 * size via SetMetadataCommand, caption presets via the clip caption-effect
 * params the monitor already syncs from, and the outro via a title clip.
 * Nothing here invents footage, words, or beats.
 */

export interface CreatorTemplate {
  id: string;
  name: string;
  description: string;
  captionPreset: CaptionPreset;
  canvasWidth: number;
  canvasHeight: number;
  /** Title-library template for the outro card (titles.ts ids). */
  outroTitleTemplateId?: string;
  outroDurationSec?: number;
  beatSync: boolean;
}

const KNOWN_PRESETS: readonly CaptionPreset[] = ['hormozi', 'karaoke', 'neon', 'minimal'];

export const CREATOR_TEMPLATES: CreatorTemplate[] = [
  {
    id: 'tpl-viral-hook',
    name: 'Viral Hook (9:16)',
    description: 'Vertical canvas, Hormozi word-pop captions, outro bumper. Built for TikTok/Reels/Shorts.',
    captionPreset: 'hormozi',
    canvasWidth: 1080,
    canvasHeight: 1920,
    outroTitleTemplateId: 'tpl-outro-bumper',
    outroDurationSec: 3,
    beatSync: false,
  },
  {
    id: 'tpl-talking-head',
    name: 'Talking Head (16:9)',
    description: 'Widescreen canvas, minimal lower-third captions, no forced reframe.',
    captionPreset: 'minimal',
    canvasWidth: 1920,
    canvasHeight: 1080,
    outroTitleTemplateId: 'tpl-lower-third',
    outroDurationSec: 4,
    beatSync: false,
  },
  {
    id: 'tpl-music-cut',
    name: 'Music Cut (1:1)',
    description: 'Square canvas, karaoke captions, beat-synced cuts. Pair with a music clip.',
    captionPreset: 'karaoke',
    canvasWidth: 1080,
    canvasHeight: 1080,
    beatSync: true,
  },
];

/** R25.4 — returns a copy of a template (throws on unknown ids). */
export function creatorTemplate(id: string): CreatorTemplate {
  const found = CREATOR_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`templates: unknown creator template '${id}'`);
  return JSON.parse(JSON.stringify(found)) as CreatorTemplate;
}

export function validateCreatorTemplate(t: CreatorTemplate): void {
  if (!t || typeof t.id !== 'string' || t.id.length === 0) {
    throw new Error('templates: template needs a non-empty id');
  }
  if (!KNOWN_PRESETS.includes(t.captionPreset)) {
    throw new Error(`templates: unknown caption preset '${String(t.captionPreset)}'`);
  }
  for (const [name, v] of [['canvasWidth', t.canvasWidth], ['canvasHeight', t.canvasHeight]] as const) {
    if (!Number.isInteger(v) || v <= 0) {
      throw new Error(`templates: ${name} must be a positive integer`);
    }
  }
  if (t.outroDurationSec !== undefined && (!Number.isFinite(t.outroDurationSec) || t.outroDurationSec <= 0)) {
    throw new Error('templates: outroDurationSec must be positive when present');
  }
}

export interface CaptionPresetUpdate {
  clipId: string;
  effectId: string;
  preset: CaptionPreset;
}

interface CaptionedClip {
  id: string;
  effects?: { id: string; type: string; enabled: boolean; params: Record<string, unknown> }[];
}

/**
 * R25.4 — targets caption/sublitle effects that actually carry words (the
 * monitor only syncs presets from effects with words). Returns targeted
 * updates plus the skipped count, reported honestly in the UI.
 */
export function captionPresetUpdates(
  clips: CaptionedClip[],
  preset: CaptionPreset
): { updates: CaptionPresetUpdate[]; skipped: number } {
  if (!KNOWN_PRESETS.includes(preset)) {
    throw new Error(`templates: unknown caption preset '${String(preset)}'`);
  }
  if (!Array.isArray(clips)) throw new Error('templates: clips must be an array');
  const updates: CaptionPresetUpdate[] = [];
  let skipped = 0;
  for (const clip of clips) {
    const eff = clip.effects?.find(
      (e) => (e.type === 'caption' || e.type === 'subtitle') && e.enabled
    );
    const words = (eff?.params as { words?: unknown } | undefined)?.words;
    if (eff && Array.isArray(words) && words.length > 0) {
      updates.push({ clipId: clip.id, effectId: eff.id, preset });
    } else {
      skipped++;
    }
  }
  return { updates, skipped };
}
