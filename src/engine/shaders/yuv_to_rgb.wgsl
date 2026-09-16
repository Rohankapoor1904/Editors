// WGSL YUV420p to RGB shader

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    // Generate full screen quad
    let x = f32((vertex_index & 1u) << 2u) - 1.0;
    let y = f32((vertex_index & 2u) << 1u) - 1.0;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
    return out;
}

@group(0) @binding(0) var y_texture: texture_2d<f32>;
@group(0) @binding(1) var u_texture: texture_2d<f32>;
@group(0) @binding(2) var v_texture: texture_2d<f32>;
@group(0) @binding(3) var tex_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let y = textureSample(y_texture, tex_sampler, in.uv).r;
    let u = textureSample(u_texture, tex_sampler, in.uv).r - 0.5;
    let v = textureSample(v_texture, tex_sampler, in.uv).r - 0.5;

    // ITU-R BT.709 conversion
    let r = y + 1.5748 * v;
    let g = y - 0.1873 * u - 0.4681 * v;
    let b = y + 1.8556 * u;

    return vec4<f32>(r, g, b, 1.0);
}
