import { describe, it, expect, beforeEach } from 'vitest';
import { useTimelineStore } from '../store/timelineStore';
import {
  add_overlay_object_executor,
  apply_clip_animation_executor,
  add_sfx_hit_executor,
  add_motion_title_executor,
  apply_punch_in_zooms_executor,
  auto_retention_edit_executor,
} from '../services/tools/effectsTools';
import { globalToolRegistry } from '../services/tools/registry';
import { RuleBasedAgentPlanner } from '../services/agentOrchestrator';
import { evaluateEasing, evaluateSpringDamper } from '../utils/keyframing';
import { secondsToRational } from '../types/time';
import { Track, TimelineState } from '../types/timeline';

describe('AI Overlay, Motion Graphics & Sound Design Tools', () => {
  beforeEach(() => {
    const baseTrack: Track = {
      id: 'v1',
      type: 'video',
      index: 0,
      name: 'V1 - Main Video',
      muted: false,
      locked: false,
      solo: false,
      height: 64,
      clips: [
        {
          id: 'clip_1',
          assetId: 'speaker_video_1',
          name: 'Main Video Clip',
          startOffset: secondsToRational(0, 30),
          duration: secondsToRational(10, 30),
          sourceIn: secondsToRational(0, 30),
          sourceOut: secondsToRational(10, 30),
          speed: 1.0,
        },
      ],
    };

    useTimelineStore.setState({
      tracks: [baseTrack],
      selectedClipIds: [],
    });
  });

  describe('Keyframing & Physics Easing', () => {
    it('evaluates spring-damper physics with realistic overshoot and settling', () => {
      const at0 = evaluateSpringDamper(0);
      const atMid = evaluateSpringDamper(0.35);
      const at1 = evaluateSpringDamper(1);

      expect(at0).toBe(0);
      // Spring overshoot exceeds 1.0 before settling
      expect(atMid).toBeGreaterThan(1.0);
      expect(at1).toBe(1.0);
    });

    it('evaluates spring and spring-pop easing strings in evaluateEasing', () => {
      const valSpring = evaluateEasing('spring', 0.35);
      expect(valSpring).toBeGreaterThan(1.0);

      const valSpringPop = evaluateEasing('spring-pop', 0.5);
      expect(valSpringPop).toBeGreaterThan(0.8);
    });
  });

  describe('add_overlay_object Tool', () => {
    it('is registered in globalToolRegistry', () => {
      const def = globalToolRegistry.getDefinition('add_overlay_object');
      expect(def).toBeDefined();
      expect(def?.name).toBe('add_overlay_object');
    });

    it('creates an overlay clip on V2 track with spring_pop animation and sfx', async () => {
      const res = await add_overlay_object_executor({
        asset_id: 'badge_clb5.png',
        start_seconds: 2.0,
        duration_seconds: 3.0,
        scale: 1.2,
        animation_preset: 'spring_pop',
        sfx: 'pop',
      });

      expect(res.success).toBe(true);
      expect(res.clip_id).toBeDefined();
      expect(res.animation_preset).toBe('spring_pop');
      expect(res.commands).toBeDefined();
      expect(res.commands!.length).toBeGreaterThanOrEqual(2); // Track + Clip + SFX

      // Apply commands to store to verify timeline state mutation
      let state: TimelineState = useTimelineStore.getState();
      for (const cmd of res.commands!) {
        state = cmd.apply(state);
      }
      useTimelineStore.setState({ past: [], future: [], tracks: state.tracks });

      const overlayTrack = state.tracks.find((t) => t.id === res.track_id);
      expect(overlayTrack).toBeDefined();
      const overlayClip = overlayTrack?.clips.find((c) => c.id === res.clip_id);
      expect(overlayClip).toBeDefined();
      expect(overlayClip?.keyframes?.['scale.x']).toBeDefined();
      expect(overlayClip?.keyframes?.['scale.x'][0].easing).toBe('spring-pop');
    });
  });

  describe('apply_clip_animation Tool', () => {
    it('is registered in globalToolRegistry', () => {
      const def = globalToolRegistry.getDefinition('apply_clip_animation');
      expect(def).toBeDefined();
      expect(def?.name).toBe('apply_clip_animation');
    });

    it('applies pendulum_swing rotation keyframes to target clip', async () => {
      const res = await apply_clip_animation_executor({
        clip_id: 'clip_1',
        animation_type: 'pendulum_swing',
        duration_seconds: 1.2,
      });

      expect(res.success).toBe(true);
      expect(res.commands).toBeDefined();
      expect(res.commands!.length).toBe(1);

      let state: TimelineState = useTimelineStore.getState();
      state = res.commands![0].apply(state);
      useTimelineStore.setState({ past: [], future: [], tracks: state.tracks });

      const clip = state.tracks[0].clips.find((c) => c.id === 'clip_1');
      expect(clip?.keyframes?.rotation).toBeDefined();
      expect(clip?.keyframes?.rotation.length).toBe(5);
    });
  });

  describe('add_sfx_hit Tool', () => {
    it('is registered in globalToolRegistry and creates an SFX track and clip', async () => {
      const def = globalToolRegistry.getDefinition('add_sfx_hit');
      expect(def).toBeDefined();

      const res = await add_sfx_hit_executor({
        sfx_type: 'whoosh',
        timestamp_seconds: 5.5,
        volume: 0.85,
      });

      expect(res.success).toBe(true);
      expect(res.commands).toBeDefined();
      expect(res.commands!.length).toBeGreaterThanOrEqual(1);

      let state: TimelineState = useTimelineStore.getState();
      for (const cmd of res.commands!) {
        state = cmd.apply(state);
      }
      useTimelineStore.setState({ past: [], future: [], tracks: state.tracks });

      const sfxTrack = state.tracks.find((t) => t.type === 'audio' && t.name.includes('SFX'));
      expect(sfxTrack).toBeDefined();
      const sfxClip = sfxTrack?.clips[0];
      expect(sfxClip?.assetId).toBe('sfx_whoosh');
      expect(sfxClip?.audioRole).toBe('sfx');
    });
  });

  describe('add_motion_title Tool', () => {
    it('creates an animated title card with spring_pop keyframes', async () => {
      const res = await add_motion_title_executor({
        text: 'French Proficiency',
        start_seconds: 1.0,
        duration_seconds: 2.5,
        style: 'highlight_card',
        animation_preset: 'spring_pop',
      });

      expect(res.success).toBe(true);
      expect(res.commands).toBeDefined();
      expect(res.commands!.length).toBeGreaterThanOrEqual(1);

      let state: TimelineState = useTimelineStore.getState();
      for (const cmd of res.commands!) {
        state = cmd.apply(state);
      }
      useTimelineStore.setState({ past: [], future: [], tracks: state.tracks });

      const titleTrack = state.tracks.find((t) => t.clips.some((c) => c.id === res.clip_id));
      const titleClip = titleTrack?.clips.find((c) => c.id === res.clip_id);
      expect(titleClip?.title?.text).toBe('French Proficiency');
      expect(titleClip?.keyframes?.['scale.x']).toBeDefined();
    });
  });

  describe('apply_punch_in_zooms Tool', () => {
    it('is registered in globalToolRegistry', () => {
      const def = globalToolRegistry.getDefinition('apply_punch_in_zooms');
      expect(def).toBeDefined();
      expect(def?.name).toBe('apply_punch_in_zooms');
    });

    it('generates rhythmic punch-in zoom keyframes on a continuous clip', async () => {
      const res = await apply_punch_in_zooms_executor({
        interval_seconds: 3.0,
        zoom_scale: 1.15,
        center_focus: 'speaker_face',
        animation_type: 'hard_cut',
      });

      expect(res.success).toBe(true);
      expect(res.total_zoom_cuts).toBeGreaterThan(0);
      expect(res.commands).toBeDefined();
      expect(res.commands!.length).toBe(1);

      let state: TimelineState = useTimelineStore.getState();
      state = res.commands![0].apply(state);
      useTimelineStore.setState({ past: [], future: [], tracks: state.tracks });

      const clip = state.tracks[0].clips[0];
      expect(clip.keyframes?.['scale.x']).toBeDefined();
      expect(clip.keyframes?.['position.y']).toBeDefined();
    });

    it('alternates scale across multiple pre-split clips', async () => {
      const multiClipTrack: Track = {
        id: 'v1',
        type: 'video',
        index: 0,
        name: 'V1',
        muted: false,
        locked: false,
        solo: false,
        height: 64,
        clips: [
          {
            id: 'c1',
            assetId: 'v_asset',
            name: 'Cut 1',
            startOffset: secondsToRational(0, 30),
            duration: secondsToRational(3, 30),
            sourceIn: secondsToRational(0, 30),
            sourceOut: secondsToRational(3, 30),
            speed: 1.0,
          },
          {
            id: 'c2',
            assetId: 'v_asset',
            name: 'Cut 2',
            startOffset: secondsToRational(3, 30),
            duration: secondsToRational(3, 30),
            sourceIn: secondsToRational(3, 30),
            sourceOut: secondsToRational(6, 30),
            speed: 1.0,
          },
        ],
      };
      useTimelineStore.setState({ tracks: [multiClipTrack] });

      const res = await apply_punch_in_zooms_executor({
        zoom_scale: 1.12,
      });

      expect(res.success).toBe(true);
      expect(res.commands!.length).toBe(2);

      let state: TimelineState = useTimelineStore.getState();
      for (const cmd of res.commands!) {
        state = cmd.apply(state);
      }
      expect(state.tracks[0].clips[0].transform?.scale.x).toBe(1.0);
      expect(state.tracks[0].clips[1].transform?.scale.x).toBe(1.12);
    });
  });

  describe('auto_retention_edit Tool', () => {
    it('is registered in globalToolRegistry', () => {
      const def = globalToolRegistry.getDefinition('auto_retention_edit');
      expect(def).toBeDefined();
      expect(def?.name).toBe('auto_retention_edit');
    });

    it('executes full retention pipeline with vertical aspect ratio, zooms, bgm, and sfx', async () => {
      const res = await auto_retention_edit_executor({
        target_ratio: '9:16',
        caption_style: 'karaoke_bounce',
        punch_in_zooms: true,
        add_bgm: true,
        add_sfx_transitions: true,
      });

      expect(res.success).toBe(true);
      expect(res.applied_steps).toBeDefined();
      expect(res.applied_steps.some((s) => s.includes('9:16'))).toBe(true);
      expect(res.applied_steps.some((s) => s.includes('punch-in zoom'))).toBe(true);
      expect(res.applied_steps.some((s) => s.includes('background music'))).toBe(true);
      expect(res.applied_steps.some((s) => s.includes('whoosh'))).toBe(true);
      expect(res.commands).toBeDefined();
      expect(res.commands!.length).toBeGreaterThan(0);
    });
  });

  describe('RuleBasedAgentPlanner Intent Routing', () => {
    const planner = new RuleBasedAgentPlanner();

    it('routes sticker and overlay prompts to add_overlay_object', async () => {
      const state = useTimelineStore.getState();
      const steps = await planner.generatePlan('add telephone sticker overlay at 2 seconds', state);
      expect(steps.some((s) => s.tool === 'add_overlay_object')).toBe(true);
    });

    it('routes animate and spring prompts to apply_clip_animation', async () => {
      const state = useTimelineStore.getState();
      const steps = await planner.generatePlan('animate this clip with spring bounce', state);
      expect(steps.some((s) => s.tool === 'apply_clip_animation')).toBe(true);
    });

    it('routes sound effect prompts to add_sfx_hit', async () => {
      const state = useTimelineStore.getState();
      const steps = await planner.generatePlan('add whoosh sfx at transition', state);
      expect(steps.some((s) => s.tool === 'add_sfx_hit')).toBe(true);
    });

    it('routes viral and retention prompts to auto_retention_edit', async () => {
      const state = useTimelineStore.getState();
      const steps = await planner.generatePlan('make a viral retention edit for shorts', state);
      expect(steps.some((s) => s.tool === 'auto_retention_edit')).toBe(true);
    });

    it('routes punch in zoom prompts to apply_punch_in_zooms', async () => {
      const state = useTimelineStore.getState();
      const steps = await planner.generatePlan('apply dynamic punch in zoom cuts for pattern interrupt', state);
      expect(steps.some((s) => s.tool === 'apply_punch_in_zooms')).toBe(true);
    });
  });
});
