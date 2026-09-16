Task: R2.2

## Verification Output

**build_output:**
```
> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1538 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-B9mlqUBh.css   37.36 kB │ gzip:  6.87 kB
dist/assets/index-CNO9zQ_O.js   243.67 kB │ gzip: 71.10 kB
✓ built in 3.74s
```

**test_output:**
```
> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app

 ✓ src/core/project/schema.test.ts (3 tests) 9ms
 ✓ __tests__/core/commands/edits.test.ts (8 tests) 12ms
 ✓ src/__tests__/core.test.ts (23 tests) 14ms
stdout | src/__tests__/webgpuRenderer.test.ts > WebGPURendererEngine > creates shader module and pipeline on initialization
[WebGPU Engine]: WebGPU Render Pipeline Initialized (32-bit Float Color Space)

stdout | src/__tests__/webgpuRenderer.test.ts > WebGPURendererEngine > renders a frame using the pipeline and releases textures
[WebGPU Engine]: WebGPU Render Pipeline Initialized (32-bit Float Color Space)

 ✓ src/__tests__/webgpuRenderer.test.ts (2 tests) 11ms
 ✓ src/__tests__/commands.test.ts (2 tests) 7ms
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
 ✓ src/__tests__/rationalTime.test.ts (1 test) 5ms

 Test Files  7 passed (7)
      Tests  51 passed (51)
   Start at  21:44:40
   Duration  1.34s (transform 525ms, setup 0ms, collect 802ms, tests 72ms, environment 2ms, prepare 606ms)
```

**lint_output:**
```
> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx

```

## Files Changed
- `src/engine/shaders/yuv_to_rgb.wgsl`
- `src/engine/webgpuRenderer.ts`
- `src/__tests__/webgpuRenderer.test.ts`
- `src/vite-env.d.ts` (new)
- `vite.config.ts` (assetsInclude added)
- `tsconfig.json` (types added)
- `package.json` (dependency added for `@webgpu/types`)
- `package-lock.json`

## Honest Limitations
This implementation operates entirely at the WebGPU API boundary logic layer as dictated by the prompt limits. Integration with the actual native FFmpeg Rust demuxer to stream real live YUV packets in and handle hardware-specific mapping limits was not done here and should be evaluated on the desktop Tauri host. Visual correctness via a known test pattern could not be asserted end-to-end since visual test fixtures with matching Tauri hooks are missing.
