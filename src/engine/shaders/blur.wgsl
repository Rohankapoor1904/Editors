// Gaussian Blur WGSL Shader

struct Uniforms {
    transform: mat4x4<f32>,
    opacity: f32,
    direction: vec2<f32>, // (1, 0) for horizontal, (0, 1) for vertical
    resolution: vec2<f32>, // texture resolution
    radius: f32,
};

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    // 6-vertex quad (2 triangles)
    var pos = vec2<f32>(0.0, 0.0);
    var uv = vec2<f32>(0.0, 0.0);

    switch (vertex_index) {
        case 0u: { pos = vec2<f32>(-1.0, 1.0); uv = vec2<f32>(0.0, 0.0); }
        case 1u: { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 1.0); }
        case 2u: { pos = vec2<f32>(1.0, 1.0); uv = vec2<f32>(1.0, 0.0); }
        case 3u: { pos = vec2<f32>(1.0, 1.0); uv = vec2<f32>(1.0, 0.0); }
        case 4u: { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 1.0); }
        case 5u: { pos = vec2<f32>(1.0, -1.0); uv = vec2<f32>(1.0, 1.0); }
        default: { pos = vec2<f32>(0.0, 0.0); uv = vec2<f32>(0.0, 0.0); }
    }

    let pos4 = vec4<f32>(pos.x, pos.y, 0.0, 1.0);
    out.position = uniforms.transform * pos4;
    out.uv = uv;

    return out;
}

@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var tex_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // A simple 9-tap Gaussian blur
    // Weights: [0.016216, 0.054054, 0.1216216, 0.1945946, 0.2270270, 0.1945946, 0.1216216, 0.054054, 0.016216]
    let offset = vec2<f32>(1.0 / uniforms.resolution.x, 1.0 / uniforms.resolution.y) * uniforms.direction * uniforms.radius;

    var color = vec4<f32>(0.0);
    color += textureSample(tex, tex_sampler, in.uv - offset * 4.0) * 0.016216;
    color += textureSample(tex, tex_sampler, in.uv - offset * 3.0) * 0.054054;
    color += textureSample(tex, tex_sampler, in.uv - offset * 2.0) * 0.1216216;
    color += textureSample(tex, tex_sampler, in.uv - offset * 1.0) * 0.1945946;
    color += textureSample(tex, tex_sampler, in.uv) * 0.2270270;
    color += textureSample(tex, tex_sampler, in.uv + offset * 1.0) * 0.1945946;
    color += textureSample(tex, tex_sampler, in.uv + offset * 2.0) * 0.1216216;
    color += textureSample(tex, tex_sampler, in.uv + offset * 3.0) * 0.054054;
    color += textureSample(tex, tex_sampler, in.uv + offset * 4.0) * 0.016216;

    return color * uniforms.opacity;
}
