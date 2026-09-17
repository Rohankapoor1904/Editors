// Chroma Key WGSL Shader

struct Uniforms {
    transform: mat4x4<f32>,
    opacity: f32,
    key_color: vec3<f32>,
    similarity: f32,
    smoothness: f32,
    spill: f32,
};

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

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

// RGB to YCbCr conversion for better chroma isolation
fn rgb2ycbcr(color: vec3<f32>) -> vec3<f32> {
    let y = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    let cb = 128.0/255.0 - 0.168736 * color.r - 0.331264 * color.g + 0.5 * color.b;
    let cr = 128.0/255.0 + 0.5 * color.r - 0.418688 * color.g - 0.081312 * color.b;
    return vec3<f32>(y, cb, cr);
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(tex, tex_sampler, in.uv);

    let key_ycbcr = rgb2ycbcr(uniforms.key_color);
    let color_ycbcr = rgb2ycbcr(color.rgb);

    // Distance in CbCr plane
    let chroma_dist = distance(color_ycbcr.gb, key_ycbcr.gb);

    let base_mask = chroma_dist - uniforms.similarity;
    let full_mask = smoothstep(0.0, uniforms.smoothness + 0.0001, base_mask);

    // Simple spill suppression
    let spill_val = clamp((chroma_dist - uniforms.similarity) / (uniforms.spill + 0.0001), 0.0, 1.0);
    color.r = mix(color.r, color.r * spill_val, 1.0 - spill_val); // simplistic

    let final_alpha = color.a * full_mask * uniforms.opacity;
    return vec4<f32>(color.rgb * full_mask, final_alpha);
}
