import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MultimodalPerceptionEngine } from '../../engine/perception/vlm';

/**
 * R21.4 travel-together pins: the heuristic disclosure in code and the
 * mechanical gate checks in scripts/verify-invariants.mjs must not drift
 * apart silently.
 */
describe('R21.4: heuristic AI honesty', () => {
  it('vlm embeddings carry a heuristic model id at runtime (never a neural claim)', async () => {
    const engine = new MultimodalPerceptionEngine();
    const frame = new Uint8Array(64);
    for (let i = 0; i < frame.length; i++) frame[i] = i % 256;
    const [embedding] = await engine.encodeFrames([frame]);
    expect(embedding.model).toBe('cinecraft-heuristic-v1');
    expect(embedding.model).not.toContain('vlm');
  });

  it('the invariant gate mechanically bans tool-path fabrication fixtures', () => {
    const gatePath = path.join(process.cwd(), 'scripts', 'verify-invariants.mjs');
    const gate = fs.readFileSync(gatePath, 'utf-8');

    // Banned live-path signatures (R21.3 fixtures)
    for (const signature of [
      'BANNED_TOOL_FIXTURES',
      'getCaptionWordsForClip',
      "word: 'Welcome'",
      'start_seconds: 3.2',
      'startSec: 2.5',
    ]) {
      expect(gate).toContain(signature);
    }

    // Positive wiring checks + VLM honesty checks
    for (const signature of [
      'whisperService',
      'sileroVadService',
      'isDemoMode()',
      'cinecraft-vlm-v1',
      'cinecraft-heuristic-v1',
    ]) {
      expect(gate).toContain(signature);
    }
  });
});
