struct CaptionUniforms {
    activeWordIndex: f32, // Passed as float to satisfy WebGPU uniform padding
    timecode: f32,
    wordCount: f32,
};

@group(3) @binding(0) var<uniform> u_caption: CaptionUniforms;
// Text rendering isn't natively supported in WGSL. We'll simulate word highlighting by blending
// a color block if the current pixel is in the active word region.
// This is a placeholder shader because we don't have a real text layout engine yet.
// We'll apply this logic over the frame output.

fn applyCaptionHighlight(inColor: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
    // Check if the current UV falls into an active "caption area"
    // Just a placeholder effect for highlighting active words
    // Real implementation would use texture atlases from HarfBuzz/FreeType

    // Bottom third of screen where captions usually are
    if (uv.y > 0.8 && uv.y < 0.95) {
        // Divide width into wordCount segments
        let wordWidth = 1.0 / max(u_caption.wordCount, 1.0);
        let currentWordIndex = floor(uv.x / wordWidth);

        // If this pixel is in the active word's bounding box
        if (abs(currentWordIndex - u_caption.activeWordIndex) < 0.1) {
            // Apply highlight (yellow tint)
            return inColor * vec3<f32>(1.2, 1.2, 0.8);
        } else {
            // Unhighlighted text area (darken slightly for contrast) ONLY if there are captions
            if (u_caption.wordCount > 0.0) {
                return inColor * 0.9;
            }
        }
    }

    return inColor;
}
