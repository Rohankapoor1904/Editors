import { describe, it, expect } from 'vitest';
import {
  planMusicBedEdit,
  musicBedEditCommands,
  findMusicBedClip,
  planDurationFrames,
  targetFromSeconds,
} from './musicEditor';
import { createRational, rationalToSeconds, addRational, subRational, compareRational } from '../types/time';
import { Clip, Track, TimelineState } from '../types/timeline';

const RATE = 60000;

function bedClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'bed1',
    assetId: 'music_a',
    name: 'Music Bed',
    startOffset: createRational(0, RATE),
    sourceIn: createRational(0, RATE),
    sourceOut: createRational(60 * RATE, RATE), // 60s source window
    duration: createRational(60 * RATE, RATE),
    audioRole: 'music',
    speed: 1.0,
    ...overrides,
  };
}

function audioTrack(clips: Clip[]): Track {
  return {
    id: 'A1',
    type: 'audio',
    index: 0,
    name: 'A1',
    muted: false,
    locked: false,
    solo: false,
    height: 56,
    clips,
  };
}

function bareState(track: Track): TimelineState {
  return {
    version: '1.0.0',
    projectId: 'p1',
    metadata: {
      name: 't',
      fps: 30,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      colorSpace: 'Rec.709',
    },
    playheadPosition: createRational(0, RATE),
    inPoint: null,
    outPoint: null,
    tracks: [track],
    selectedClipIds: [],
    activeWorkspace: 'edit',
    markers: [],
    comments: [],
    magneticSnapping: true,
    zoomLevel: 20,
  };
}

describe('R25.6 — music bed editor plan', () => {
  it('trims a 60s bed to 30s exactly (acceptance: 30s ±1 frame)', () => {
    const plan = planMusicBedEdit(createRational(60 * RATE, RATE), createRational(30 * RATE, RATE));
    expect(plan.mode).toBe('trim');
    expect(rationalToSeconds(plan.resultDuration)).toBeCloseTo(30, 9);
    // ±1 frame at 30 fps and at 60 fps.
    expect(Math.abs(planDurationFrames(plan, 30) - 900)).toBeLessThanOrEqual(1);
    expect(Math.abs(planDurationFrames(plan, 60) - 1800)).toBeLessThanOrEqual(1);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].sourceEndSec).toBeCloseTo(30, 9);
  });

  it('loops a 30s bed up to 60s with exact rational sum (no pitch/speed change)', () => {
    const plan = planMusicBedEdit(createRational(30 * RATE, RATE), createRational(60 * RATE, RATE));
    expect(plan.mode).toBe('loop');
    expect(plan.segments).toHaveLength(2);
    expect(rationalToSeconds(plan.resultDuration)).toBeCloseTo(60, 9);
    for (const seg of plan.segments) {
      expect(seg.sourceEndSec - seg.sourceStartSec).toBeCloseTo(30, 9);
    }
    // Result equals target bit-exactly via rational compare.
    expect(compareRational(plan.resultDuration, createRational(60 * RATE, RATE))).toBe(0);
  });

  it('handles a non-integer remainder on loop (45s → 60s = 45 + 15)', () => {
    const plan = planMusicBedEdit(createRational(45 * RATE, RATE), createRational(60 * RATE, RATE));
    expect(plan.mode).toBe('loop');
    expect(plan.segments).toHaveLength(2);
    expect(rationalToSeconds(plan.segments[0].duration)).toBeCloseTo(45, 9);
    expect(rationalToSeconds(plan.segments[1].duration)).toBeCloseTo(15, 9);
    expect(compareRational(plan.resultDuration, createRational(60 * RATE, RATE))).toBe(0);
  });

  it('marks equal durations as exact with no mutation commands', () => {
    const plan = planMusicBedEdit(createRational(30 * RATE, RATE), createRational(30 * RATE, RATE));
    expect(plan.mode).toBe('exact');
    const track = audioTrack([bedClip({
      sourceOut: createRational(30 * RATE, RATE),
      duration: createRational(30 * RATE, RATE),
    })]);
    const { commands, transaction } = musicBedEditCommands(track, track.clips[0], createRational(30 * RATE, RATE), RATE);
    expect(commands).toHaveLength(0);
    const after = transaction.apply(bareState(track));
    expect(rationalToSeconds(after.tracks[0].clips[0].duration)).toBeCloseTo(30, 9);
  });

  it('rejects non-positive durations and empty targets', () => {
    expect(() => planMusicBedEdit(createRational(0, RATE), createRational(30, RATE))).toThrow(/positive/);
    expect(() => planMusicBedEdit(createRational(60, RATE), createRational(0, RATE))).toThrow(/positive/);
    expect(() => targetFromSeconds(0, RATE)).toThrow(/invalid target/);
    expect(() => targetFromSeconds(NaN, RATE)).toThrow(/invalid target/);
  });
});

describe('R25.6 — music bed commands (store mutations)', () => {
  it('applies a trim command that lands the bed at 30s ±1 frame (acceptance)', () => {
    const track = audioTrack([bedClip()]);
    const state = bareState(track);
    const target = createRational(30 * RATE, RATE);
    const { plan, transaction } = musicBedEditCommands(track, track.clips[0], target, RATE);
    const after = transaction.apply(state);

    expect(after.tracks[0].clips).toHaveLength(1);
    const clip = after.tracks[0].clips[0];
    const frames30 = Math.round(rationalToSeconds(clip.duration) * 30);
    expect(Math.abs(frames30 - 900)).toBeLessThanOrEqual(1);
    expect(plan.mode).toBe('trim');
    // Source window shortened in lockstep (non-destructive reference edit).
    expect(rationalToSeconds(clip.sourceOut)).toBeCloseTo(30, 6);
    expect(rationalToSeconds(clip.sourceIn)).toBeCloseTo(0, 6);
    // Speed untouched → no pitch-shift artifacts.
    expect(clip.speed ?? 1.0).toBe(1.0);
  });

  it('loops a short bed by appending tiled clips that sum to the target', () => {
    const short = bedClip({
      sourceOut: createRational(20 * RATE, RATE),
      duration: createRational(20 * RATE, RATE),
    });
    const track = audioTrack([short]);
    const target = createRational(50 * RATE, RATE);
    const { plan, transaction } = musicBedEditCommands(track, short, target, RATE);
    const after = transaction.apply(bareState(track));

    expect(plan.mode).toBe('loop');
    expect(after.tracks[0].clips.length).toBe(3); // 20 + 20 + 10
    const total = after.tracks[0].clips.reduce(
      (acc: import('../types/time').RationalTime, c: Clip) => addRational(acc, c.duration),
      createRational(0, RATE)
    );
    expect(compareRational(total, target)).toBe(0);
    expect(rationalToSeconds(total)).toBeCloseTo(50, 9);
    // Every loop segment stays at speed 1.0.
    for (const c of after.tracks[0].clips) {
      expect(c.speed ?? 1.0).toBe(1.0);
    }
  });

  it('is undoable: invert restores the original single bed clip', () => {
    const track = audioTrack([bedClip()]);
    const state = bareState(track);
    const { transaction } = musicBedEditCommands(
      track,
      track.clips[0],
      createRational(30 * RATE, RATE),
      RATE
    );
    const after = transaction.apply(state);
    expect(rationalToSeconds(after.tracks[0].clips[0].duration)).toBeCloseTo(30, 6);
    const restored = transaction.invert(after);
    expect(restored.tracks[0].clips).toHaveLength(1);
    expect(rationalToSeconds(restored.tracks[0].clips[0].duration)).toBeCloseTo(60, 6);
  });

  it('finds a music bed by audioRole or name and skips muted/locked tracks', () => {
    const good = audioTrack([bedClip({ audioRole: 'sfx', name: 'background music bed v2' })]);
    const locked = audioTrack([bedClip({ id: 'bedL' })]);
    locked.locked = true;
    const muted = audioTrack([bedClip({ id: 'bedM', name: 'Music Bed' })]);
    muted.muted = true;

    expect(findMusicBedClip([locked, muted, good])?.clip.id).toBe('bed1');
    expect(findMusicBedClip([locked, muted])).toBeNull();

    const byRole = audioTrack([bedClip({ id: 'bedR', name: 'underscore', audioRole: 'music' })]);
    expect(findMusicBedClip([byRole])?.clip.id).toBe('bedR');
  });
});

describe('R25.6 — plan duration drift guard', () => {
  it('keeps rational sum exact across awkward rates (29.97 fps timeline)', () => {
    const fpsRate = 30000;
    const source = createRational(Math.round(10 * fpsRate), fpsRate); // 10s
    const target = createRational(Math.round(7.5 * fpsRate * 2), fpsRate); // 15s
    const plan = planMusicBedEdit(source, target);
    expect(plan.mode).toBe('loop');
    expect(compareRational(plan.resultDuration, target)).toBe(0);
    // Float seconds still within half a frame at 29.97.
    const drift = Math.abs(rationalToSeconds(subRational(plan.resultDuration, target)));
    expect(drift).toBeLessThan(1 / 29.97 / 2);
  });
});
