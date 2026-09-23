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
    // R24.2: baked master+channel 1D curves (64 RGBA entries, w unused).
    curveLut: array<vec4<f32>, 64>,
    curveParams: vec4<f32>, // x: enabled (0/1)
    // R24.2: HSL secondary qualifier + isolated grade.
    secA: vec4<f32>, // hueCenter, hueWidth, hueSoftness, enabled
    secB: vec4<f32>, // satMin, satMax, lumaMin, lumaMax
    secC: vec4<f32>, // boxSoftness, 0, 0, 0
    secLift: vec3<f32>,
    pad6: f32,
    secGain: vec3<f32>,
    pad7: f32,
    // R24.1: whole-grade mask gate (normalized frame coords).
    maskA: vec4<f32>, // cx, cy, sx, sy
    maskB: vec4<f32>, // rotation, feather, invert, enabled
    maskC: vec4<f32>, // shapeFlag (0 = rect, 1 = ellipse), 0, 0, 0
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

fn sample_baked_channel(x: f32, channel: i32) -> f32 {
    let fx = clamp(x, 0.0, 1.0) * 63.0;
    let i0 = clamp(i32(floor(fx)), 0, 62);
    let t = fx - f32(i0);
    let e0 = u_color.curveLut[i0];
    let e1 = u_color.curveLut[i0 + 1];
    if (channel == 0) {
        return mix(e0.r, e1.r, t);
    } else if (channel == 1) {
        return mix(e0.g, e1.g, t);
    }
    return mix(e0.b, e1.b, t);
}

fn apply_curves(col: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        sample_baked_channel(col.r, 0),
        sample_baked_channel(col.g, 1),
        sample_baked_channel(col.b, 2)
    );
}

fn rgb_to_hsl(c: vec3<f32>) -> vec3<f32> {
    let mx = max(c.r, max(c.g, c.b));
    let mn = min(c.r, min(c.g, c.b));
    let l = (mx + mn) * 0.5;
    if (mx == mn) {
        return vec3<f32>(0.0, 0.0, l);
    }
    let d = mx - mn;
    var s = 0.0;
    if (l > 0.5) {
        s = d / (2.0 - mx - mn);
    } else {
        s = d / (mx + mn);
    }
    var h = 0.0;
    if (mx == c.r) {
        h = (c.g - c.b) / d;
        if (c.g < c.b) {
            h = h + 6.0;
        }
    } else if (mx == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    return vec3<f32>(h / 6.0, s, l);
}

// R24.2: qualifier box with inclusive hard edges at zero softness, mirroring
// the CPU boxWeight semantics exactly (smoothstep with equal edges is
// undefined in WGSL, so the hard case branches explicitly).
fn box_weight(v: f32, lo: f32, hi: f32, soft: f32) -> f32 {
    if (soft <= 0.0) {
        if (v >= lo && v <= hi) {
            return 1.0;
        }
        return 0.0;
    }
    return smoothstep(lo - soft, lo, v) * (1.0 - smoothstep(hi, hi + soft, v));
}

fn secondary_weight(c: vec3<f32>) -> f32 {
    let hsl = rgb_to_hsl(c);
    let dh = abs(hsl.x - u_color.secA.x);
    let hueDist = min(dh, 1.0 - dh);
    let halfGate = u_color.secA.y * 0.5;
    var hueW = 0.0;
    if (u_color.secA.z <= 0.0) {
        if (hueDist <= halfGate) {
            hueW = 1.0;
        }
    } else {
        hueW = 1.0 - smoothstep(halfGate, halfGate + u_color.secA.z, hueDist);
    }
    let satW = box_weight(hsl.y, u_color.secB.x, u_color.secB.y, u_color.secC.x);
    let lumaW = box_weight(hsl.z, u_color.secB.z, u_color.secB.w, u_color.secC.x);
    return hueW * satW * lumaW;
}

// R24.1: soft mask alpha at normalized frame coords, mirroring the CPU
// maskAlphaAt semantics (rotation, feather falloff, invert, inclusive
// hard edges at zero feather).
fn mask_alpha(uv: vec2<f32>) -> f32 {
    let dx = uv.x - u_color.maskA.x;
    let dy = uv.y - u_color.maskA.y;
    let cosT = cos(u_color.maskB.x);
    let sinT = sin(u_color.maskB.x);
    let rx = dx * cosT + dy * sinT;
    let ry = -dx * sinT + dy * cosT;
    let hx = u_color.maskA.z * 0.5;
    let hy = u_color.maskA.w * 0.5;
    let feather = u_color.maskB.y;
    var alpha = 0.0;
    if (u_color.maskC.x > 0.5) {
        // Ellipse.
        let r = sqrt((rx / hx) * (rx / hx) + (ry / hy) * (ry / hy));
        if (feather <= 0.0) {
            if (r <= 1.0) {
                alpha = 1.0;
            }
        } else {
            alpha = 1.0 - smoothstep(1.0 - feather, 1.0, r);
        }
    } else {
        // Rect.
        let edgeDistance = min(hx - abs(rx), hy - abs(ry));
        if (feather <= 0.0) {
            if (edgeDistance >= 0.0) {
                alpha = 1.0;
            }
        } else {
            alpha = smoothstep(0.0, feather * min(hx, hy), edgeDistance);
        }
    }
    if (u_color.maskB.z > 0.5) {
        alpha = 1.0 - alpha;
    }
    return alpha;
}

fn apply3WayColorGrade(inColor: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    // 1. Temperature & Tint Adjustment
    var col = inColor + vec3<f32>(u_color.params.z * 0.1, 0.0, -u_color.params.z * 0.1);
    col += vec3<f32>(u_color.params.w * 0.05, -u_color.params.w * 0.1, u_color.params.w * 0.05);

    // 2. Lift (Shadows adjustment) ASC-CDL
    col = max(vec3<f32>(0.0), col + u_color.lift);

    // 3. Gamma (Midtones power curve)
    let safeGamma = max(vec3<f32>(0.01), u_color.gamma);
    col = pow(col, 1.0 / safeGamma);

    // R24.2: 1D tone curves (baked LUT uniform).
    if (u_color.curveParams.x > 0.5) {
        col = apply_curves(col);
    }

    // R24.2: HSL secondary isolated grade.
    if (u_color.secA.w > 0.5) {
        let w = secondary_weight(col);
        if (w > 0.0) {
            let inside = max(vec3<f32>(0.0), col + u_color.secLift) * u_color.secGain;
            col = mix(col, inside, w);
        }
    }

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

    col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

    // R24.1: whole-grade mask gate — the grade lands inside the mask only.
    if (u_color.maskB.w > 0.5) {
        col = mix(inColor, col, mask_alpha(uv));
    }

    return clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
}
