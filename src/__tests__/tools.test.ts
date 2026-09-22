import { describe, it, expect } from 'vitest';
import { globalToolRegistry } from '../services/tools/registry';
import { setRuntimeMode } from '../services/runtimeConfig';
import { useMediaPoolStore } from '../store/mediaPool';

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

  it('should fail honestly (no fabricated words) when no real audio resolves in live mode', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('transcribe_and_align', { asset_id: 'test' });
    // R21.3: the hardcoded "Welcome to CineCraft AI" fixture is gone — without
    // a resolvable audio file the tool reports a typed error instead.
    expect(result).toHaveProperty('error');
    expect(['unknown_asset', 'transcription_unavailable']).toContain((result as any).error);
  });

  it('should fail honestly for unknown assets instead of fabricating probe metadata', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('probe_media', { asset_id: 'asset_fixture_1' });
    // R21.3: the fabricated 1920x1080/15s fallback is gone.
    expect(result).toHaveProperty('error', 'unknown_asset');
  });

  it('should probe real media pool assets without fabrication', async () => {
    setRuntimeMode('live');
    useMediaPoolStore.setState({
      assets: [
        {
          id: 'asset_real_1',
          name: 'Interview_A.mp4',
          path: '/media/Interview_A.mp4',
          type: 'video',
          duration: '00:01:30',
          fps: '29.97',
          resolution: '3840x2160',
          fingerprint: 'fp-real-1',
          isOffline: false,
        },
      ],
      selectedAssetId: null,
    });
    const result = await globalToolRegistry.execute('probe_media', { asset_id: 'asset_real_1' });
    expect(result).not.toHaveProperty('error');
    expect((result as any).width).toBe(3840);
    expect((result as any).height).toBe(2160);
    expect((result as any).duration).toBe(90);
    useMediaPoolStore.setState({ assets: [], selectedAssetId: null });
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

  it('should fail honestly (no fabricated silence gap) when no real audio resolves', async () => {
    setRuntimeMode('live');
    const result = await globalToolRegistry.execute('timeline_remove_silence', { threshold_seconds: 0.5 });
    // R21.3: the hardcoded 2.5s/0.8s gap is gone — without VAD audio the tool
    // reports a typed error instead of fake ripple deletes.
    expect(result).toHaveProperty('error');
    expect(['no_audio', 'unknown_asset', 'vad_unavailable']).toContain((result as any).error);
  });
});
