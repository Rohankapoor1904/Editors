## Task: R6.2
Implement forced alignment and text-to-timeline binding. When words are deleted in the transcript, their accurate audio ranges are removed from the timeline using reverse-temporal ripple deletes, and the UI's word timings are updated smoothly.

## Verbatim Verification Commands

```
$ npm run build

> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1545 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-DxgiZcJu.css   38.40 kB │ gzip:  6.98 kB
dist/assets/index-BbMbGb6I.js   260.31 kB │ gzip: 76.26 kB
✓ built in 3.84s


$ npm run test

> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 ✓ __tests__/core/commands/edits.test.ts (8 tests) 13ms
 ✓ src/engine/effects/baseEffects.test.ts (6 tests) 17ms
 ✓ src/__tests__/core.test.ts (23 tests | 1 skipped) 14ms
 ✓ src/__tests__/vramPool.test.ts (7 tests) 12ms
 ✓ src/core/project/schema.test.ts (3 tests) 8ms
 ✓ src/__tests__/keyframing.behavior.test.ts (14 tests) 13ms
 ✓ src/__tests__/alignment.test.ts (4 tests) 10ms
stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Live Mode (Default): All stubs MUST throw NotImplementedError > whisperService throws NotImplementedError
[Whisper Engine]: Processing speech-to-text on /path/to/test.wav...
[Whisper Engine]: Processing speech-to-text on /path/to/test.wav...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Live Mode (Default): All stubs MUST throw NotImplementedError > sileroVadService throws NotImplementedError
[Silero VAD Engine]: Detecting silent gaps > 0.5s in "/path/to/test.wav"...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Live Mode (Default): All stubs MUST throw NotImplementedError > nativeBridge throws NotImplementedError on probe, demux, and proxy
[Native Bridge]: Generating H.264 low-res proxy for /path/to/test.mp4...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Live Mode (Default): All stubs MUST throw NotImplementedError > exportEngine throws NotImplementedError
[Export Engine]: Initiating hardware encode for preset "YouTube 4K"...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Live Mode (Default): All stubs MUST throw NotImplementedError > sam2Engine throws NotImplementedError
[SAM 2 Engine]: Generating dynamic mask for click point (100, 100)...
[SAM 2 Engine]: Tracking object across 5 frames from (100, 100)...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Demo Mode (Opt-in): Stubs return preview mock data > whisperService returns mock transcript without throwing
[Whisper Engine]: Processing speech-to-text on /demo/audio.wav...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Demo Mode (Opt-in): Stubs return preview mock data > sileroVadService returns mock silence windows without throwing
[Silero VAD Engine]: Detecting silent gaps > 0.5s in "/demo/audio.wav"...

stdout | src/__tests__/runtimeMode.test.ts > RuntimeMode & Safe-by-Default Boundary (R0.3) > In Demo Mode (Opt-in): Stubs return preview mock data > sam2Engine returns fallback bounding box without throwing
[SAM 2 Engine]: Generating dynamic mask for click point (200, 300)...

 ✓ src/__tests__/runtimeMode.test.ts (12 tests) 18ms
stdout | src/__tests__/audioMasterClock.test.ts > Audio Master Clock (R2.4) > test with a VFR fixture: after 60s of playback, A/V offset stays < 1 frame
Final offset after 60s playback: 0 seconds

 ✓ src/__tests__/audioMasterClock.test.ts (1 test) 107ms
stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager R2.5 > gain of -6dB measurably halves amplitude
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager R2.5 > overlapping clips crossfade without clicks
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager Routes R5.1 > routes track correctly to graph buses based on track id
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

 ✓ src/engine/audioEngine.test.ts (3 tests) 18ms
 ✓ src/engine/frameCache.test.ts (4 tests) 9ms
 ✓ src/engine/parametricEq.test.ts (3 tests) 9ms
 ✓ src/__tests__/RenderGraph.test.ts (2 tests) 6ms
stdout | src/__tests__/webgpuRenderer.test.ts > WebGPURendererEngine > creates shader module and pipeline on initialization
[WebGPU Engine]: WebGPU Render Pipeline Initialized (32-bit Float Color Space)

stdout | src/__tests__/webgpuRenderer.test.ts > WebGPURendererEngine > renders a frame using the pipeline and releases textures
[WebGPU Engine]: WebGPU Render Pipeline Initialized (32-bit Float Color Space)

 ✓ src/__tests__/webgpuRenderer.test.ts (2 tests) 12ms
 ✓ src/__tests__/commands.test.ts (2 tests) 7ms
 ✓ src/engine/scopes.test.ts (3 tests) 9ms
 ✓ src/engine/audioGraph.test.ts (2 tests) 11ms
 ✓ src/core/commands/audio.test.ts (2 tests) 6ms
 ✓ src/__tests__/transforms.test.ts (3 tests) 8ms
 ✓ src/engine/colorManagement.test.ts (4 tests) 7ms
 ✓ src/__tests__/rationalTime.test.ts (1 test) 7ms
 ✓ src/engine/limiter.test.ts (2 tests) 9ms
 ✓ src/engine/loudness.test.ts (2 tests) 43ms
 ✓ src/utils/audio.test.ts (2 tests) 4ms

 Test Files  24 passed (24)
      Tests  114 passed | 1 skipped (115)
   Start at  00:09:49
   Duration  3.24s (transform 842ms, setup 0ms, collect 1.50s, tests 377ms, environment 6ms, prepare 2.15s)


$ npm run lint

> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx

```

## Files Changed
- `src/services/alignment.ts`
- `src/__tests__/alignment.test.ts`
- `src/components/TranscriptEditor.tsx`
- `PROGRESS.md`
- `docs/WORKLOG.md`

## Honest Limitations
This implementation uses basic heuristic groupings for closely spaced words (e.g. gaps < 0.001s). Words with longer natural pauses (like between sentences) will be issued as distinct `rippleDelete` operations. To be perfectly frame-accurate and prevent visual frame jump tearing, bounding alignments may eventually need to snap to exact `rationalTime` video boundaries or handle half-frame overlap if a word ends strictly within a frame.
