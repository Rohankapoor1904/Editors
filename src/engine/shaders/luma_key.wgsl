// Luma Key WGSL Shader

struct Uniforms {
    transform: mat4x4<f32>,
    opacity: f32,
    threshold: f32,
    softness: f32,
    invert: f32, // 0.0 = key out below threshold, 1.0 = key out above threshold
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

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(tex, tex_sampler, in.uv);

    // Rec.709 luma
    let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));

    var alpha = 1.0;

    if (uniforms.invert > 0.5) {
        // Key out pixels *above* threshold
        alpha = smoothstep(uniforms.threshold - uniforms.softness, uniforms.threshold, luma);
    } else {
        // Key out pixels *below* threshold
        alpha = smoothstep(uniforms.threshold, uniforms.threshold + uniforms.softness, luma);
    }

    // Premultiply RGB with computed alpha, then apply overall opacity
    let final_alpha = color.a * alpha * uniforms.opacity;
    return vec4<f32>(color.rgb * alpha, final_alpha);
}
