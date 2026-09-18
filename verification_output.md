## Verification output
### `npm run build`
```

> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1551 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-gKBQ2b_i.css   38.63 kB │ gzip:  7.00 kB
dist/assets/index-CZcK3pf7.js   270.68 kB │ gzip: 79.39 kB
✓ built in 4.00s
```

### `npm run test`
```

> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 ✓ __tests__/core/commands/edits.test.ts (8 tests) 16ms
stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager R2.5 > gain of -6dB measurably halves amplitude
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager R2.5 > applyMicroCrossfade schedules a 10ms crossfade between adjacent clips
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager R2.5 > overlapping clips crossfade without clicks
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

stdout | src/engine/audioEngine.test.ts > WebAudioEngineManager Routes R5.1 > routes track correctly to graph buses based on track id
[Audio Engine]: WebAudio Sub-frame Graph Initialized at 48000 Hz

 ✓ src/engine/audioEngine.test.ts (4 tests) 24ms
 ✓ src/__tests__/core.test.ts (23 tests | 1 skipped) 14ms
 ✓ src/__tests__/vramPool.test.ts (7 tests) 11ms
 ✓ src/core/project/schema.test.ts (3 tests) 11ms
 ✓ src/engine/effects/baseEffects.test.ts (6 tests) 17ms
 ✓ src/__tests__/keyframing.behavior.test.ts (14 tests) 20ms
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

 ✓ src/__tests__/runtimeMode.test.ts (12 tests) 14ms
 ✓ src/engine/frameCache.test.ts (4 tests) 7ms
stdout | src/__tests__/audioMasterClock.test.ts > Audio Master Clock (R2.4) > test with a VFR fixture: after 60s of playback, A/V offset stays < 1 frame
Final offset after 60s playback: 0 seconds

 ✓ src/__tests__/audioMasterClock.test.ts (1 test) 112ms
 ✓ src/engine/parametricEq.test.ts (3 tests) 9ms
stdout | src/__tests__/webgpuRenderer.test.ts > WebGPURendererEngine > creates shader module and pipeline on initialization
[WebGPU Engine]: WebGPU Render Pipeline Initialized (32-bit Float Color Space)

stdout | src/__tests__/webgpuRenderer.test.ts > WebGPURendererEngine > renders a frame using the pipeline and releases textures
[WebGPU Engine]: WebGPU Render Pipeline Initialized (32-bit Float Color Space)

 ✓ src/__tests__/webgpuRenderer.test.ts (2 tests) 13ms
 ✓ src/__tests__/RenderGraph.test.ts (2 tests) 5ms
 ✓ src/services/agentOrchestrator.test.ts (1 test) 8ms
 ✓ src/__tests__/tools.test.ts (9 tests) 9ms
 ✓ src/__tests__/commands.test.ts (2 tests) 7ms
 ✓ src/engine/scopes.test.ts (3 tests) 8ms
 ✓ src/engine/audioGraph.test.ts (2 tests) 10ms
stdout | src/__tests__/autoReframe.test.ts > AutoReframeEngine (R6.6) > keeps the subject strictly inside the crop window for every frame despite Kalman smoothing lag
[Auto-Reframe Engine]: Smoothing trajectory across 100 frames using Kalman filter...

stdout | src/__tests__/autoReframe.test.ts > AutoReframeEngine (R6.6) > handles empty trajectory safely
[Auto-Reframe Engine]: Smoothing trajectory across 0 frames using Kalman filter...

 ✓ src/__tests__/autoReframe.test.ts (2 tests) 27ms
 ✓ src/engine/voiceIsolation.test.ts (1 test) 30ms
 ✓ src/core/commands/audio.test.ts (2 tests) 5ms
 ✓ src/__tests__/transforms.test.ts (3 tests) 5ms
 ✓ src/engine/colorManagement.test.ts (4 tests) 7ms
 ✓ src/__tests__/rationalTime.test.ts (1 test) 5ms
 ✓ src/engine/limiter.test.ts (2 tests) 8ms
 ✓ src/engine/perception/vlm.test.ts (4 tests) 6ms
 ✓ __tests__/engine/captionEngine.test.ts (2 tests) 4ms
 ✓ src/engine/loudness.test.ts (2 tests) 47ms
 ✓ src/services/semanticSearch.test.ts (2 tests) 5ms
 ✓ src/utils/audio.test.ts (2 tests) 3ms

 Test Files  31 passed (31)
      Tests  136 passed | 1 skipped (137)
   Start at  08:21:04
   Duration  4.19s (transform 1.03s, setup 0ms, collect 1.78s, tests 477ms, environment 9ms, prepare 2.65s)

```

### `npm run lint`
```

> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx

```
