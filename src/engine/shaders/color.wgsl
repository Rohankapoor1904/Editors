struct ColorGradeUniforms {
    lift: vec3<f32>,
    pad1: f32,
    gamma: vec3<f32>,
    pad2: f32,
    gain: vec3<f32>,
    pad3: f32,
    offset: vec3<f32>,
    pad4: f32,
    params: vec4<f32>, // x: saturation, y: contrast, z: temperature, w: tint
    lutParams: vec2<f32>, // x: lutSize, y: lutIntensity
    pad5: vec2<f32>,
};

@group(2) @binding(0) var<uniform> u_color: ColorGradeUniforms;
@group(2) @binding(1) var u_lutTexture: texture_3d<f32>;
@group(2) @binding(2) var u_lutSampler: sampler;

fn sample_lut_tetrahedral(lut: texture_3d<f32>, samp: sampler, c: vec3<f32>, lut_size: f32) -> vec3<f32> {
    let max_idx = lut_size - 1.0;
    let coords = c * max_idx;

    let index = floor(coords);
    let f = coords - index;

    let p000 = textureSampleLevel(lut, samp, (index + vec3<f32>(0.0, 0.0, 0.0)) / max_idx, 0.0).rgb;
    let p100 = textureSampleLevel(lut, samp, (index + vec3<f32>(1.0, 0.0, 0.0)) / max_idx, 0.0).rgb;
    let p010 = textureSampleLevel(lut, samp, (index + vec3<f32>(0.0, 1.0, 0.0)) / max_idx, 0.0).rgb;
    let p001 = textureSampleLevel(lut, samp, (index + vec3<f32>(0.0, 0.0, 1.0)) / max_idx, 0.0).rgb;
    let p110 = textureSampleLevel(lut, samp, (index + vec3<f32>(1.0, 1.0, 0.0)) / max_idx, 0.0).rgb;
    let p101 = textureSampleLevel(lut, samp, (index + vec3<f32>(1.0, 0.0, 1.0)) / max_idx, 0.0).rgb;
    let p011 = textureSampleLevel(lut, samp, (index + vec3<f32>(0.0, 1.0, 1.0)) / max_idx, 0.0).rgb;
    let p111 = textureSampleLevel(lut, samp, (index + vec3<f32>(1.0, 1.0, 1.0)) / max_idx, 0.0).rgb;

    var result: vec3<f32>;

    if (f.x > f.y) {
        if (f.y > f.z) {
            result = p000 + f.x * (p100 - p000) + f.y * (p110 - p100) + f.z * (p111 - p110);
        } else if (f.x > f.z) {
            result = p000 + f.x * (p100 - p000) + f.z * (p101 - p100) + f.y * (p111 - p101);
        } else {
            result = p000 + f.z * (p001 - p000) + f.x * (p101 - p001) + f.y * (p111 - p101);
        }
    } else {
        if (f.z > f.y) {
            result = p000 + f.z * (p001 - p000) + f.y * (p011 - p001) + f.x * (p111 - p011);
        } else if (f.z > f.x) {
            result = p000 + f.y * (p010 - p000) + f.z * (p011 - p010) + f.x * (p111 - p011);
        } else {
            result = p000 + f.y * (p010 - p000) + f.x * (p110 - p010) + f.z * (p111 - p110);
        }
    }

    return result;
}

fn apply3WayColorGrade(inColor: vec3<f32>) -> vec3<f32> {
    // 1. Temperature & Tint Adjustment
    var col = inColor + vec3<f32>(u_color.params.z * 0.1, 0.0, -u_color.params.z * 0.1);
    col += vec3<f32>(u_color.params.w * 0.05, -u_color.params.w * 0.1, u_color.params.w * 0.05);

    // 2. Lift (Shadows adjustment) ASC-CDL
    col = max(vec3<f32>(0.0), col + u_color.lift);

    // 3. Gamma (Midtones power curve)
    let safeGamma = max(vec3<f32>(0.01), u_color.gamma);
    col = pow(col, 1.0 / safeGamma);

    // 4. Gain & Offset (Highlights multiplier & global offset)
    col = col * u_color.gain + u_color.offset;

    // 5. Contrast Adjustment
    let contrast = u_color.params.y;
    col = (col - vec3<f32>(0.5)) * contrast + vec3<f32>(0.5);

    // 6. Saturation Adjustment
    let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
    let sat = u_color.params.x;
    col = mix(vec3<f32>(luma), col, sat);

    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

    // 7. 3D LUT Tetrahedral Evaluation
    if (u_color.lutParams.y > 0.0) {
        let lutColor = sample_lut_tetrahedral(u_lutTexture, u_lutSampler, col, u_color.lutParams.x);
        col = mix(col, lutColor, u_color.lutParams.y);
    }

    return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
}
