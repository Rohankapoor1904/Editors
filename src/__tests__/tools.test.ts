import { describe, it, expect } from 'vitest';
import { globalToolRegistry } from '../services/tools/registry';
import { setRuntimeMode } from '../services/runtimeConfig';

// Initialize the tools mapping by importing them
import '../services/tools/index';

describe('Tool Layer Set 1: Metadata & Timeline', () => {
  it('should validate tool definition schemas', () => {
    const probe = globalToolRegistry.getDefinition('probe_media');
    expect(probe).toBeDefined();

    const cut = globalToolRegistry.getDefinition('cut_and_arrange_timeline');
    expect(cut).toBeDefined();
    expect(cut?.parameters.properties.edits.type).toBe('array');
  });

  it('should reject invalid probe_media arguments', async () => {
    const result = await globalToolRegistry.execute('probe_media', {});
    expect(result).toHaveProperty('error', 'validation_error');
    expect((result as any).details).toContain('Missing required argument: asset_id');
  });

  it('should reject invalid detect_silence arguments', async () => {
    const result = await globalToolRegistry.execute('detect_silence', { asset_id: 123 });
    expect(result).toHaveProperty('error', 'validation_error');
    expect((result as any).details[0]).toContain('expected string, got number');
  });

  it('should reject malformed cut_and_arrange_timeline edits', async () => {
    const result = await globalToolRegistry.execute('cut_and_arrange_timeline', {
      edits: [{ asset_id: '123', start_time: 0 }] // missing end_time
    });
    expect(result).toHaveProperty('error', 'validation_error');
    expect((result as any).details[0]).toContain('Missing required property: edits[0].end_time');
  });

  it('should execute transcribe_and_align successfully and return aligned words in live mode', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('transcribe_and_align', { asset_id: 'test' });
    expect(result).not.toHaveProperty('error');
    expect((result as any).asset_id).toBe('test');
    expect(Array.isArray((result as any).words)).toBe(true);
    expect((result as any).words.length).toBeGreaterThan(0);
  });

  it('should execute probe_media successfully and return media dimensions', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('probe_media', { asset_id: 'asset_fixture_1' });
    expect(result).not.toHaveProperty('error');
    expect((result as any).width).toBe(1920);
    expect((result as any).height).toBe(1080);
    expect((result as any).duration).toBeGreaterThan(0);
  });

  it('should execute cut_and_arrange_timeline and return real commands', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('cut_and_arrange_timeline', {
      track_id: 'v1',
      edits: [{ asset_id: 'asset_1', start_time: 0, end_time: 4.5, timeline_position: 0 }]
    });
    expect(result).not.toHaveProperty('error');
    expect((result as any).success).toBe(true);
    expect((result as any).commands.length).toBe(1);
  });
});

describe('Tool Layer Set 2: Effects & Export', () => {
  it('should validate tool definition schemas', () => {
    const subtitles = globalToolRegistry.getDefinition('add_subtitles');
    expect(subtitles).toBeDefined();

    const aspect = globalToolRegistry.getDefinition('sequence_set_aspect_ratio');
    expect(aspect).toBeDefined();
  });

  it('should reject invalid add_subtitles arguments', async () => {
    const result = await globalToolRegistry.execute('add_subtitles', { style: 'invalid_style' });
    expect(result).toHaveProperty('error', 'validation_error');
    expect((result as any).details[0]).toContain('must be one of [bold_yellow_highlight, clean_white, karaoke_bounce]');
  });

  it('should apply defaults and execute render_video successfully in live mode', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('render_video', { resolution: '1080p' });
    expect(result).not.toHaveProperty('error');
    expect((result as any).success).toBe(true);
    expect((result as any).width).toBe(1920);
    expect((result as any).height).toBe(1080);
    expect((result as any).fps).toBe(30);
  });

  it('should reject invalid transcript_filter_tokens arguments', async () => {
    const result = await globalToolRegistry.execute('transcript_filter_tokens', {
      asset_id: '123',
      retained_token_ranges: [{ start_token_index: 0, end_token_index: '10' }] // invalid type
    });
    expect(result).toHaveProperty('error', 'validation_error');
    expect((result as any).details[0]).toContain('expected integer, got 10');
  });

  it('should execute timeline_remove_silence and return ripple deletion commands', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('timeline_remove_silence', { threshold_seconds: 0.5 });
    expect(result).not.toHaveProperty('error');
    expect((result as any).success).toBe(true);
    expect((result as any).commands.length).toBeGreaterThan(0);
  });
});
