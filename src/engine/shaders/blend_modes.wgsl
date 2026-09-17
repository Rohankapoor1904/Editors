// Blend Modes WGSL Shader

struct Uniforms {
    transform: mat4x4<f32>,
    opacity: f32,
    mode: f32, // 0: Normal/Over, 1: Multiply, 2: Screen, 3: Overlay
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

@group(0) @binding(0) var tex_base: texture_2d<f32>;
@group(0) @binding(1) var tex_blend: texture_2d<f32>;
@group(0) @binding(2) var tex_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(tex_base, tex_sampler, in.uv);
    let blend = textureSample(tex_blend, tex_sampler, in.uv);

    var result = vec3<f32>(0.0);
    let m = i32(uniforms.mode + 0.5);

    if (m == 1) {
        // Multiply
        result = base.rgb * blend.rgb;
    } else if (m == 2) {
        // Screen
        result = vec3<f32>(1.0) - (vec3<f32>(1.0) - base.rgb) * (vec3<f32>(1.0) - blend.rgb);
    } else if (m == 3) {
        // Overlay
        let is_less = step(base.rgb, vec3<f32>(0.5));
        let less_val = 2.0 * base.rgb * blend.rgb;
        let greater_val = vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - base.rgb) * (vec3<f32>(1.0) - blend.rgb);
        result = mix(greater_val, less_val, is_less);
    } else {
        // Normal / Over (Standard Alpha Blending)
        result = mix(base.rgb, blend.rgb, blend.a);
    }

    // Apply overall opacity to the blended result's contribution
    let final_rgb = mix(base.rgb, result, blend.a * uniforms.opacity);
    let final_alpha = base.a + blend.a * uniforms.opacity * (1.0 - base.a); // Simplified standard alpha blend math

    return vec4<f32>(final_rgb, final_alpha);
}
