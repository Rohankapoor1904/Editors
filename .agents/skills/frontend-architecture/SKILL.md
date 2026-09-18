---
name: frontend-architecture
description: >-
  Production frontend architecture for CineCraft AI desktop video editor.
  Use when developing, refactoring, or optimizing React 18, TypeScript, Zustand timeline state,
  Canvas/WebCodecs rendering loops, and zero-latency playhead interactions.
---

# Production Frontend Architecture: CineCraft AI

This skill guides the implementation and optimization of high-performance frontend components in CineCraft AI.

## 1. Architectural Principles

1. **Decouple Render Loop from React State**:
   - Never store high-frequency values (e.g. `playheadPosition` during 60 FPS playback) in React state.
   - High-frequency playhead advances run via `requestAnimationFrame` reading from `transportEngine` directly.
   - Canvas/WebGPU renders frames directly from the master clock without triggering React component tree re-renders.

2. **Atomic Zustand Selectors**:
   - Always use fine-grained selectors:
     ```typescript
     // GOOD: Only re-renders when zoom changes
     const zoom = useTimelineStore((state) => state.zoom);
     
     // BAD: Re-renders on any timeline state mutation
     const { zoom, tracks, playhead } = useTimelineStore();
     ```
   - Use `shallow` equality when selecting objects or arrays to prevent reference inequality thrashing.

3. **Strict TypeScript & Zero `any`**:
   - All timeline entities must use canonical types defined in `src/types/timeline.ts`:
     - `RationalTime { value: bigint | number, rate: number }`
     - `Track { id, name, type, muted, locked, volume, pan, clips }`
     - `Clip { id, trackId, assetId, trimIn, trimOut, timelineStart, duration, transform, effects }`
   - Never cast to `any` on the editorial or render path.

4. **Command Pattern Integration**:
   - Never directly mutate timeline state inside UI button handlers (`onClick`).
   - Dispatch commands through the transactional command stack:
     ```typescript
     executeCommand(new SplitClipCommand(clipId, splitTime));
     ```
   - All editorial actions must support `undo()` and `redo()`.

## 2. Component Layout & Responsiveness

- **Modular Panels**:
  - `TopBar`: Project metadata, undo/redo history controls, transport status, export CTA.
  - `AssetBin`: Media library, drag-and-drop ingestion, proxy generation indicators.
  - `ProgramMonitor`: Dual-canvas WebGPU viewport, interactive transform gizmo (pan/scale/rotate).
  - `AIPromptConsole`: Agentic natural language command interface, tool execution trace.
  - `TimelineTrackEditor`: Multi-track video/audio tracks, snapping grid, ripple-edit handles.
  - `TranscriptEditor`: Text-based rough cut editor synchronized with whisper word timestamps.

## 3. Performance Optimization Checklist

- [ ] Virtualize long track views when timeline contains > 50 clips.
- [ ] Render timeline waveforms and thumbnail filmstrips offscreen into `ImageBitmap` or Canvas cache.
- [ ] Use CSS `transform: translate3d(...)` for playhead movement to keep it entirely on the GPU compositor thread.
- [ ] Ensure all event listeners on scrubbing handles use `pointerdown`, `setPointerCapture`, and passive listeners.
