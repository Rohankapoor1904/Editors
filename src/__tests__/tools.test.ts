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

  it('should throw NotImplementedError when executing tools (in live mode)', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('transcribe_and_align', { asset_id: 'test' });
    expect(result).toHaveProperty('error', 'execution_error');
    expect((result as any).details).toContain('transcribe_and_align');
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

  it('should apply defaults for render_video', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('render_video', { resolution: '1080p' });
    // It should hit execution_error (NotImplementedError) meaning validation passed
    expect(result).toHaveProperty('error', 'execution_error');
  });

  it('should reject invalid transcript_filter_tokens arguments', async () => {
    const result = await globalToolRegistry.execute('transcript_filter_tokens', {
      asset_id: '123',
      retained_token_ranges: [{ start_token_index: 0, end_token_index: '10' }] // invalid type
    });
    expect(result).toHaveProperty('error', 'validation_error');
    expect((result as any).details[0]).toContain('expected integer, got 10');
  });
});
