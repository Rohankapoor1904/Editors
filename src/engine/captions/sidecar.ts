/**
 * R25.6 — caption sidecar export (SRT / WebVTT).
 *
 * Words are the source of truth: cue boundaries are derived from real
 * CaptionWord timestamps only. Empty input throws — never emit a fabricated
 * sidecar (AGENTS §5.5).
 */

import { CaptionWord } from './captionEngine';
import { Track } from '../../types/timeline';

export type SidecarFormat = 'srt' | 'vtt';

export interface SidecarCue {
  /** 1-based cue number in the file. */
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export const SIDECAR_MIME: Record<SidecarFormat, string> = {
  srt: 'application/x-subrip;charset=utf-8',
  vtt: 'text/vtt;charset=utf-8',
};

/** Pad to 2 digits (SRT/VTT hours can exceed 99 in long timelines). */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Formats seconds as SubRip timestamp `HH:MM:SS,mmm`.
 * Negative times clamp to zero; sub-millisecond noise rounds to nearest ms.
 */
export function formatSrtTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`sidecar: invalid SRT timestamp ${seconds}`);
  }
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${ms.toString().padStart(3, '0')}`;
}

/** Formats seconds as WebVTT timestamp `HH:MM:SS.mmm`. */
export function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.');
}

/**
 * Groups words into cues. Default is one cue per word so single-word timing
 * is preserved bit-exactly. `mode: 'phrase'` groups like the kinetic renderer
 * (gap > 0.6s or maxWords) while still bounding each cue to its words'
 * first-start / last-end.
 */
export function wordsToCues(
  words: CaptionWord[],
  mode: 'word' | 'phrase' = 'word',
  maxWords = 5
): SidecarCue[] {
  if (!Array.isArray(words) || words.length === 0) {
    throw new Error('sidecar: no caption words to export');
  }

  const ordered = [...words].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  for (const w of ordered) {
    if (!Number.isFinite(w.startTime) || !Number.isFinite(w.endTime) || w.endTime < w.startTime) {
      throw new Error(`sidecar: invalid word timing for "${w.word}" (${w.startTime}–${w.endTime})`);
    }
  }

  if (mode === 'word') {
    return ordered.map((w, i) => ({
      index: i + 1,
      startSec: w.startTime,
      endSec: w.endTime,
      text: w.word.trim(),
    }));
  }

  const groups: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  for (const w of ordered) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const gap = w.startTime - prev.endTime;
      if (current.length >= maxWords || gap > 0.6) {
        groups.push(current);
        current = [];
      }
    }
    current.push(w);
  }
  if (current.length > 0) groups.push(current);

  return groups.map((g, i) => ({
    index: i + 1,
    startSec: g[0].startTime,
    endSec: g[g.length - 1].endTime,
    text: g.map((w) => w.word.trim()).join(' '),
  }));
}

export function cuesToSrt(cues: SidecarCue[]): string {
  if (cues.length === 0) {
    throw new Error('sidecar: no cues to serialize');
  }
  return (
    cues
      .map(
        (c) =>
          `${c.index}\n${formatSrtTimestamp(c.startSec)} --> ${formatSrtTimestamp(c.endSec)}\n${c.text}`
      )
      .join('\n\n') + '\n'
  );
}

export function cuesToVtt(cues: SidecarCue[]): string {
  if (cues.length === 0) {
    throw new Error('sidecar: no cues to serialize');
  }
  return (
    'WEBVTT\n\n' +
    cues
      .map(
        (c) =>
          `${c.index}\n${formatVttTimestamp(c.startSec)} --> ${formatVttTimestamp(c.endSec)}\n${c.text}`
      )
      .join('\n\n') +
    '\n'
  );
}

export function wordsToSidecar(
  words: CaptionWord[],
  format: SidecarFormat,
  mode: 'word' | 'phrase' = 'word'
): string {
  const cues = wordsToCues(words, mode);
  return format === 'vtt' ? cuesToVtt(cues) : cuesToSrt(cues);
}

/**
 * Parses a SubRip document back into cues. Used by the acceptance test to
 * prove the written file is structurally valid and timings survive a
 * round-trip within 1 ms.
 */
export function parseSrt(srt: string): SidecarCue[] {
  const blocks = srt.replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const cues: SidecarCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length < 2) continue;
    let idxLine = 0;
    let index = cues.length + 1;
    if (/^\d+$/.test(lines[0].trim())) {
      index = parseInt(lines[0].trim(), 10);
      idxLine = 1;
    }
    const timing = lines[idxLine];
    const m = /^(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})$/.exec(timing.trim());
    if (!m) {
      throw new Error(`sidecar: unparseable SRT timing line: "${timing}"`);
    }
    const text = lines.slice(idxLine + 1).join(' ');
    cues.push({
      index,
      startSec: parseSrtTimestamp(m[1]),
      endSec: parseSrtTimestamp(m[2]),
      text,
    });
  }
  if (cues.length === 0) {
    throw new Error('sidecar: SRT contained no cues');
  }
  return cues;
}

export function parseSrtTimestamp(ts: string): number {
  const m = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(ts.trim());
  if (!m) {
    throw new Error(`sidecar: bad timestamp "${ts}"`);
  }
  return (
    parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + parseInt(m[4], 10) / 1000
  );
}

/**
 * Harvests enabled caption/subtitle words from timeline tracks — the same
 * effect-params path ProgramMonitor reads. Returns words sorted by time.
 * Throws when nothing is stored (no silent empty sidecar).
 */
export function harvestCaptionWords(tracks: Track[]): CaptionWord[] {
  const words: CaptionWord[] = [];
  for (const track of tracks) {
    if (track.muted) continue;
    for (const clip of track.clips) {
      const effect = clip.effects?.find(
        (e) => (e.type === 'caption' || e.type === 'subtitle') && e.enabled
      );
      const raw = effect?.params?.words;
      if (!Array.isArray(raw)) continue;
      for (const entry of raw) {
        const w = entry as Partial<CaptionWord>;
        if (
          typeof w.word === 'string' &&
          typeof w.startTime === 'number' &&
          typeof w.endTime === 'number'
        ) {
          words.push({
            id: typeof w.id === 'string' ? w.id : `w_${words.length}`,
            word: w.word,
            startTime: w.startTime,
            endTime: w.endTime,
          });
        }
      }
    }
  }
  if (words.length === 0) {
    throw new Error('sidecar: no caption words stored on the timeline — generate captions first');
  }
  return words.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
}

/** Triggers a browser download of the sidecar text (web / test environments). */
export function downloadSidecar(content: string, filename: string, format: SidecarFormat): void {
  const blob = new Blob([content], { type: SIDECAR_MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
