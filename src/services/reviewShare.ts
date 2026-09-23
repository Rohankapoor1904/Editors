/**
 * R26.5 — review share + collaboration service.
 *
 * Timecoded comments live on the timeline and round-trip through project JSON.
 * This service packages them into a shareable review bundle (base64 data URL)
 * and runs the platform-safe publish gate. No remote server is invented — the
 * "link" is a self-contained payload a reviewer can open in the same app.
 */

import { TimelineState, TimelineComment } from '../types/timeline';
import { serializeProject } from '../core/project/serialize';
import { MediaAsset } from '../store/mediaPool';
import {
  SocialPreset,
  SOCIAL_PRESETS,
  getPresetById,
  assertPublishCompatible,
  PublishCompatibilityError,
} from '../engine/exportPresets';
import { rationalToSeconds } from '../types/time';

export interface ReviewCommentPayload {
  id: string;
  timeSec: number;
  time: { value: number; rate: number };
  author: string;
  body: string;
  resolved: boolean;
  createdAt: string;
}

export interface ReviewBundle {
  kind: 'cinecraft-review';
  version: 1;
  projectId: string;
  projectName: string;
  exportedAt: string;
  comments: ReviewCommentPayload[];
  /** Full project JSON so a reviewer can open the sequence (optional). */
  projectJson?: string;
}

export function commentPayload(c: TimelineComment): ReviewCommentPayload {
  return {
    id: c.id,
    timeSec: rationalToSeconds(c.time),
    time: { value: c.time.value, rate: c.time.rate },
    author: c.author,
    body: c.body,
    resolved: c.resolved,
    createdAt: c.createdAt,
  };
}

/**
 * Builds a review bundle from the live timeline state. Includes project JSON
 * when assets are supplied so the link is self-describing.
 */
export function buildReviewBundle(
  state: TimelineState,
  assets?: MediaAsset[],
  nowIso?: string
): ReviewBundle {
  const comments = (state.comments ?? []).map(commentPayload);
  // Sort by time for stable, human-ordered review.
  comments.sort((a, b) => a.timeSec - b.timeSec);

  const bundle: ReviewBundle = {
    kind: 'cinecraft-review',
    version: 1,
    projectId: state.projectId || '',
    projectName: state.metadata?.name || 'Untitled',
    exportedAt: nowIso ?? new Date().toISOString(),
    comments,
  };
  if (assets) {
    bundle.projectJson = serializeProject(state, assets);
  }
  return bundle;
}

/** Encodes a bundle as a shareable `cinecraft-review:` data URL fragment. */
export function encodeReviewLink(bundle: ReviewBundle): string {
  const json = JSON.stringify(bundle);
  const b64 =
    typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, 'utf-8').toString('base64');
  return `cinecraft-review://v1/${b64}`;
}

/** Decodes a link produced by encodeReviewLink. Throws typed errors on garbage. */
export function decodeReviewLink(link: string): ReviewBundle {
  if (typeof link !== 'string' || !link.startsWith('cinecraft-review://v1/')) {
    throw new Error('decodeReviewLink: not a CineCraft review link');
  }
  const b64 = link.slice('cinecraft-review://v1/'.length);
  let json: string;
  try {
    const decoded =
      typeof atob === 'function'
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, 'base64').toString('utf-8');
    json = decoded;
  } catch {
    throw new Error('decodeReviewLink: invalid base64 payload');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('decodeReviewLink: payload is not JSON');
  }
  const bundle = parsed as ReviewBundle;
  if (!bundle || bundle.kind !== 'cinecraft-review' || bundle.version !== 1 || !Array.isArray(bundle.comments)) {
    throw new Error('decodeReviewLink: payload is not a v1 review bundle');
  }
  return bundle;
}

export interface PublishCheckInput {
  masterWidth: number;
  masterHeight: number;
  presetId: string;
}

export interface PublishCheckResult {
  ok: true;
  presetId: string;
  presetName: string;
}

/**
 * R26.5 — 1-click publish preflight. Returns a typed result on success or
 * throws PublishCompatibilityError on aspect/size mismatch (never silently
 * proceeds into an encode that would crop/letterbox without the user asking).
 */
export function checkPublishReady(input: PublishCheckInput): PublishCheckResult {
  const preset = getPresetById(input.presetId);
  if (!preset) {
    throw new PublishCompatibilityError(
      'SIZE_MISMATCH',
      { width: input.masterWidth, height: input.masterHeight },
      SOCIAL_PRESETS[0],
      `Unknown publish preset '${input.presetId}'`
    );
  }
  assertPublishCompatible({ width: input.masterWidth, height: input.masterHeight }, preset);
  return { ok: true, presetId: preset.id, presetName: preset.name };
}

export type { SocialPreset, PublishCompatibilityError };
export { SOCIAL_PRESETS, getPresetById, assertPublishCompatible };
