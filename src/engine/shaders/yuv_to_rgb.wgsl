// WGSL YUV420p to RGB shader

struct Uniforms {
    transform: mat4x4<f32>,
    opacity: f32,
};

@group(1) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    // Instead of a single oversized triangle, we'll draw a standard quad using 6 vertices (2 triangles)
    // Vertices: (x, y)
    // 0: (-1, 1), 1: (-1, -1), 2: (1, 1)  -> Triangle 1
    // 3: (1, 1),  4: (-1, -1), 5: (1, -1) -> Triangle 2

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

    return vec4<f32>(r, g, b, uniforms.opacity);
}
