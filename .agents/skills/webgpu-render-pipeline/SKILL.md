---
name: webgpu-render-pipeline
description: >-
  WebGPU rendering pipeline and WGSL shader development for CineCraft AI.
  Use when writing WGSL shaders, color grading algorithms, 3D LUT tetrahedral interpolation,
  DAG render graphs, and GPU video scopes (Parade, Vectorscope, Histogram).
---

# WebGPU Render Pipeline & WGSL Shader Engine

This skill governs the GPU-accelerated compositing, color correction, and real-time analysis pipeline in CineCraft AI.

## 1. WebGPU Initialization & Pipeline Best Practices

1. **Shader Compilation (Invariant 7)**:
   - Ship real shaders with valid `@vertex` and `@fragment` / `@compute` entry points.
   - Never stub a render pass without a shader module.
   - Use `createRenderPipelineAsync` during initialization to prevent blocking the GPU driver on the UI thread.

2. **Pipeline Re-use**:
   - Compiling a `GPURenderPipeline` is expensive (~10-50ms).
   - Create pipelines ONCE during engine setup and cache them in a registry keyed by shader identifier and blend state.
   - Only bind groups and uniform buffers should be updated per-frame.

3. **External Video Textures (Zero-Copy 60FPS)**:
   - Use `device.importExternalTexture({ source: videoFrame })` whenever sampling WebCodecs `VideoFrame` handles.
   - Declare the texture as `texture_external` in WGSL. The browser driver handles zero-copy YUV→RGB conversion internally.

## 2. WGSL Shaders: Color Grading & Transforms

- **3-Way Color Wheels (Lift, Gamma, Gain)**:
  - Math formula for color adjustment:
    ```wgsl
    // Lift (shadows), Gamma (midtones), Gain (highlights)
    let liftAdjust = (color.rgb - 1.0) * lift + 1.0;
    let gainAdjust = liftAdjust * gain;
    let gammaAdjust = pow(max(gainAdjust, vec3<f32>(0.0)), 1.0 / max(gamma, vec3<f32>(0.001)));
    ```
- **Tetrahedral 3D LUT Interpolation**:
  - Sample 33x33x33 or 65x65x65 `.cube` LUTs using 3D texture samplers with linear filtering.
- **Affine Transform Matrix**:
  - Apply 3x3 transform matrix uniform for translation, scale, anchor point offset, and rotation.

## 3. GPU Video Scopes Compute Passes

- **RGB Parade**:
  - Downsamples active frame to a column-histogram compute buffer.
  - Renders separate Red, Green, and Blue channels side-by-side with 0-100 IRE grid overlays.
- **Vectorscope**:
  - Maps RGB to YUV/YCbCr color space.
  - Plots U (Cb) vs. V (Cr) chrominance coordinates on a circular polar graticule with 75% color bar targets.
- **Histogram**:
  - Computes 256-bin luminance distribution via GPU atomic additions (`atomicAdd`).

## 4. Render Graph (DAG) Execution

- Nodes represent timeline clips, generators, transitions, and effects.
- Topologically sort the DAG before frame submission.
- Use dirty-flag tracking on node inputs; cached intermediate textures skip re-rendering if inputs are unchanged.
