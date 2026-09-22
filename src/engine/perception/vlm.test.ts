import { describe, it, expect, beforeEach } from 'vitest';
import { MultimodalPerceptionEngine } from './vlm';
import { setRuntimeMode } from '../../services/runtimeConfig';

describe('MultimodalPerceptionEngine (Task R19.3)', () => {
  beforeEach(() => {
    setRuntimeMode('live');
  });

  it('encodes video frames into 64-dimensional unit-normalized embeddings', async () => {
    const engine = new MultimodalPerceptionEngine();
    const frame = new Uint8Array(1920 * 4); // single line RGBA
    for (let i = 0; i < frame.length; i += 4) {
      frame[i] = 180;     // R
      frame[i + 1] = 120; // G
      frame[i + 2] = 90;  // B
      frame[i + 3] = 255; // A
    }

    const embeddings = await engine.encodeFrames([frame]);
    expect(embeddings).toHaveLength(1);
    expect(embeddings[0].vector).toHaveLength(64);
    expect(embeddings[0].model).toBe('cinecraft-heuristic-v1'); // R21.4: heuristic id, not a neural VLM claim

    // Check unit L2 norm: sum(v_i^2) ≈ 1.0
    const normSq = embeddings[0].vector.reduce((acc, v) => acc + v * v, 0);
    expect(Math.abs(normSq - 1.0)).toBeLessThan(1e-4);
  });

  it('produces reproducible and semantically clustered embeddings for near-duplicate frames', async () => {
    const engine = new MultimodalPerceptionEngine();

    // Frame A
    const frameA = new Uint8Array(400);
    for (let i = 0; i < frameA.length; i++) frameA[i] = (i % 256);

    // Frame B (near identical with ±2 noise)
    const frameB = new Uint8Array(400);
    for (let i = 0; i < frameB.length; i++) frameB[i] = Math.min(255, (i % 256) + 1);

    const [embA, embB] = await engine.encodeFrames([frameA, frameB]);

    // Compute dot product (cosine similarity since unit norm)
    let cosineSim = 0;
    for (let i = 0; i < 64; i++) {
      cosineSim += embA.vector[i] * embB.vector[i];
    }

    expect(cosineSim).toBeGreaterThan(0.95);
  });

  it('classifies scene intent from visual metrics and transcript keywords', async () => {
    const engine = new MultimodalPerceptionEngine();
    const frames = [new Uint8Array(400)];

    const interviewIntents = await engine.classifyIntent(
      frames,
      'Welcome to today podcast interview with our special guest'
    );
    expect(interviewIntents).toContain('talking_head');
    expect(interviewIntents).toContain('interview');

    const tutorialIntents = await engine.classifyIntent(
      frames,
      'Click on this button to run the code in our tutorial software'
    );
    expect(tutorialIntents).toContain('screen_recording');
    expect(tutorialIntents).toContain('tutorial');
  });
});
