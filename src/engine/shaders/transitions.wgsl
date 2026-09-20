// Video Transitions WGSL Shader

struct TransitionUniforms {
    progress: f32,       // 0.0 to 1.0
    transitionType: u32, // 0: CrossDissolve, 1: DipToBlack, 2: DipToWhite, 3: WipeLeft, 4: WipeRight, 5: WipeUp, 6: WipeDown
    feather: f32,        // Softness of edge (e.g. 0.01 to 0.1)
    _padding: f32,
};

@group(1) @binding(0) var<uniform> uniforms: TransitionUniforms;

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

    out.position = vec4<f32>(pos.x, pos.y, 0.0, 1.0);
    out.uv = uv;

    return out;
}

@group(0) @binding(0) var tex_a: texture_2d<f32>;
@group(0) @binding(1) var tex_b: texture_2d<f32>;
@group(0) @binding(2) var tex_sampler: sampler;

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let colorA = textureSample(tex_a, tex_sampler, in.uv);
    let colorB = textureSample(tex_b, tex_sampler, in.uv);
    let p = clamp(uniforms.progress, 0.0, 1.0);
    let feather = max(uniforms.feather, 0.001);

    var finalColor = colorA;

    switch (uniforms.transitionType) {
        // 0: CrossDissolve
        case 0u: {
            finalColor = mix(colorA, colorB, p);
        }
        // 1: DipToBlack
        case 1u: {
            if (p < 0.5) {
                let factor = p * 2.0;
                finalColor = mix(colorA, vec4<f32>(0.0, 0.0, 0.0, 1.0), factor);
            } else {
                let factor = (p - 0.5) * 2.0;
                finalColor = mix(vec4<f32>(0.0, 0.0, 0.0, 1.0), colorB, factor);
            }
        }
        // 2: DipToWhite
        case 2u: {
            if (p < 0.5) {
                let factor = p * 2.0;
                finalColor = mix(colorA, vec4<f32>(1.0, 1.0, 1.0, 1.0), factor);
            } else {
                let factor = (p - 0.5) * 2.0;
                finalColor = mix(vec4<f32>(1.0, 1.0, 1.0, 1.0), colorB, factor);
            }
        }
        // 3: WipeLeft (wipes from right to left, revealing B)
        case 3u: {
            let edge = 1.0 - p;
            let blend = smoothstep(edge - feather, edge + feather, in.uv.x);
            finalColor = mix(colorA, colorB, blend);
        }
        // 4: WipeRight (wipes from left to right, revealing B)
        case 4u: {
            let edge = p;
            let blend = 1.0 - smoothstep(edge - feather, edge + feather, in.uv.x);
            finalColor = mix(colorA, colorB, blend);
        }
        // 5: WipeUp (wipes from bottom to top, revealing B)
        case 5u: {
            let edge = 1.0 - p;
            let blend = smoothstep(edge - feather, edge + feather, in.uv.y);
            finalColor = mix(colorA, colorB, blend);
        }
        // 6: WipeDown (wipes from top to bottom, revealing B)
        case 6u: {
            let edge = p;
            let blend = 1.0 - smoothstep(edge - feather, edge + feather, in.uv.y);
            finalColor = mix(colorA, colorB, blend);
        }
        default: {
            finalColor = mix(colorA, colorB, p);
        }
    }

    return finalColor;
}
