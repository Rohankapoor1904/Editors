import { AddTitleClipCommand } from '../core/commands/titleCommands';
import { InsertCommand } from '../core/commands/edits';
import { CompoundCommand } from '../core/commands/transaction';
import { TitleSpec } from '../types/timeline';
import { RationalTime, createRational } from '../types/time';

/**
 * R25.2 — script-to-video draft planner.
 *
 * Turns a pasted script into an editable draft timeline: one title scene
 * clip per script block, each timed to an estimated scratch-VO duration
 * (words-per-minute rate, documented below), plus an optional REAL music
 * bed from an existing pool asset. Generated voiceover and generated
 * music do not exist yet (R25.3) — the planner emits timed silent
 * structure, never synthesized media, and says so in the panel.
 */

export interface ScriptScene {
  heading: string;
  body: string;
}

/** Default English narration rate (words per minute). */
export const DEFAULT_WPM = 150;
/** Floor keeping micro-scenes selectable on the timeline. */
export const MIN_SCENE_SEC = 2;

/**
 * R25.2 — splits pasted text into scenes on blank lines. The heading is
 * the first line, truncated; the body is the full block. Empty input and
 * whitespace-only input throw instead of yielding a one-scene draft.
 */
export function parseScriptToScenes(text: string): ScriptScene[] {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('scriptToVideo: script text must be non-empty');
  }
  const blocks = text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
  if (blocks.length === 0) {
    throw new Error('scriptToVideo: no scenes found in script text');
  }
  return blocks.map((block) => {
    const firstLine = block.split(/\r?\n/)[0].trim();
    return {
      heading: firstLine.slice(0, 48),
      body: block,
    };
  });
}

/** Counts whitespace-separated tokens. */
export function countWords(text: string): number {
  if (typeof text !== 'string') throw new Error('scriptToVideo: text must be a string');
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * R25.2 — scratch-VO duration estimate: words / wpm * 60, floored at
 * MIN_SCENE_SEC. An ESTIMATE (the panel labels it as such) — exact timing
 * arrives with real TTS in R25.3.
 */
export function estimateVoSeconds(text: string, wpm: number = DEFAULT_WPM): number {
  if (!Number.isFinite(wpm) || wpm <= 0) {
    throw new Error('scriptToVideo: wpm must be a positive finite number');
  }
  return Math.max(MIN_SCENE_SEC, (countWords(text) / wpm) * 60);
}

export interface ScriptVideoPlan {
  trackId: string;
  /** Optional audio track for a real music-bed asset. */
  audioTrackId?: string;
  /** Pool asset id used verbatim as the bed (never generated). */
  musicAssetId?: string;
  startAtSec: number;
  rate: number;
  /** Title style for scene cards. */
  titleStyle?: Partial<Pick<TitleSpec, 'fontFamily' | 'fontSize' | 'color' | 'background' | 'align'>>;
}

export interface ScriptVideoResult {
  commands: (AddTitleClipCommand | InsertCommand)[];
  transaction: CompoundCommand;
  sceneCount: number;
  totalSec: number;
  bedPlaced: boolean;
}

function toRational(seconds: number, rate: number): RationalTime {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error('scriptToVideo: plan time must be a finite non-negative number');
  }
  return createRational(Math.round(seconds * rate), rate);
}

/**
 * R25.2 — plans one title scene per script block with VO-matched
 * durations, sequential from the insert point, plus the optional bed.
 * One transaction reverts the whole draft.
 */
export function planScriptToVideo(
  scenes: ScriptScene[],
  plan: ScriptVideoPlan,
  wpm: number = DEFAULT_WPM
): ScriptVideoResult {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('scriptToVideo: need at least one scene to plan');
  }
  if (!plan.trackId) throw new Error('scriptToVideo: trackId is required');
  if (!Number.isFinite(plan.startAtSec) || plan.startAtSec < 0) {
    throw new Error('scriptToVideo: startAtSec must be a finite non-negative number');
  }
  if (!Number.isInteger(plan.rate) || plan.rate <= 0) {
    throw new Error('scriptToVideo: rate must be a positive integer timebase');
  }
  if (plan.musicAssetId && !plan.audioTrackId) {
    throw new Error('scriptToVideo: a music bed needs both musicAssetId and audioTrackId');
  }

  const style = plan.titleStyle ?? {};
  let cursor = toRational(plan.startAtSec, plan.rate);
  const commands: (AddTitleClipCommand | InsertCommand)[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    if (!scene || typeof scene.body !== 'string' || scene.body.length === 0) {
      throw new Error(`scriptToVideo: scene ${i} has no body`);
    }
    const sceneSec = estimateVoSeconds(scene.body, wpm);
    const duration = toRational(sceneSec, plan.rate);
    commands.push(
      new AddTitleClipCommand(plan.trackId, `scriptscene_${Date.now()}_${i}`, {
        text: `${scene.heading}\n\n${scene.body}`.slice(0, 500),
        fontFamily: style.fontFamily ?? 'Inter, sans-serif',
        fontSize: style.fontSize ?? 0.055,
        color: style.color ?? '#ffffff',
        background: style.background ?? 'rgba(0,0,0,0.55)',
        align: style.align ?? 'center',
        box: { x: 0.08, y: 0.3, w: 0.84, h: 0.4 },
      }, cursor, duration)
    );
    cursor = createRational(cursor.value + duration.value, plan.rate);
  }

  const totalSec = (cursor.value - toRational(plan.startAtSec, plan.rate).value) / plan.rate;
  let bedPlaced = false;
  if (plan.musicAssetId && plan.audioTrackId) {
    const bedDuration = toRational(Math.max(MIN_SCENE_SEC, totalSec), plan.rate);
    commands.push(
      new InsertCommand(plan.audioTrackId, {
        id: `scriptbed_${Date.now()}`,
        assetId: plan.musicAssetId,
        name: 'Music Bed (script draft)',
        startOffset: toRational(plan.startAtSec, plan.rate),
        sourceIn: toRational(0, plan.rate),
        sourceOut: bedDuration,
        duration: bedDuration,
      }, false)
    );
    bedPlaced = true;
  }

  return { commands, transaction: new CompoundCommand(commands), sceneCount: scenes.length, totalSec, bedPlaced };
}
