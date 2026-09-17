import { describe, it, expect } from 'vitest';
import { computeHistogram, computeRGBParade, computeVectorscope } from './scopes';

describe('Video Scopes Engine', () => {

  // Create a minimal synthetic image to test:
  // Let's create an 8x1 image
  // 0: Black (0, 0, 0)
  // 1: White (255, 255, 255)
  // 2: Red (255, 0, 0)
  // 3: Green (0, 255, 0)
  // 4: Blue (0, 0, 255)
  // 5: Cyan (0, 255, 255)
  // 6: Magenta (255, 0, 255)
  // 7: Yellow (255, 255, 0)

  const width = 8;
  const height = 1;
  const data = new Uint8ClampedArray([
    0,   0,   0,   255, // Black
    255, 255, 255, 255, // White
    255, 0,   0,   255, // Red
    0,   255, 0,   255, // Green
    0,   0,   255, 255, // Blue
    0,   255, 255, 255, // Cyan
    255, 0,   255, 255, // Magenta
    255, 255, 0,   255  // Yellow
  ]);

  const imageData: ImageData = {
    data,
    width,
    height,
    colorSpace: 'srgb'
  };

  describe('computeHistogram', () => {
    it('correctly bins RGB and Luma values', () => {
      const hist = computeHistogram(imageData);

      // Red channel expects: 4 at 0, 4 at 255
      expect(hist.r[0]).toBe(4);
      expect(hist.r[255]).toBe(4);

      // Green channel expects: 4 at 0, 4 at 255
      expect(hist.g[0]).toBe(4);
      expect(hist.g[255]).toBe(4);

      // Blue channel expects: 4 at 0, 4 at 255
      expect(hist.b[0]).toBe(4);
      expect(hist.b[255]).toBe(4);

      // Luma expects:
      // Black: 0
      // White: 255
      // Red: ~54 (0.2126 * 255)
      // Green: ~182 (0.7152 * 255)
      // Blue: ~18 (0.0722 * 255)
      // Cyan: ~201 (182 + 18)
      // Magenta: ~73 (54 + 18)
      // Yellow: ~237 (54 + 182)

      expect(hist.luma[0]).toBe(1); // Black
      expect(hist.luma[255]).toBe(1); // White
      expect(hist.luma[Math.round(0.2126 * 255)]).toBe(1); // Red
    });
  });

  describe('computeRGBParade', () => {
    it('correctly positions colors horizontally', () => {
      // 8 pixels mapped into target width. Let's use targetWidth 8 for 1:1 mapping
      const parade = computeRGBParade(imageData, 8);

      expect(parade.width).toBe(8);
      expect(parade.height).toBe(256);

      // Column 0: Black
      // R=0, G=0, B=0
      expect(parade.r[0 * 8 + 0]).toBe(1);
      expect(parade.r[255 * 8 + 0]).toBe(0);

      // Column 1: White
      // R=255, G=255, B=255
      expect(parade.r[255 * 8 + 1]).toBe(1);
      expect(parade.r[0 * 8 + 1]).toBe(0);

      // Column 2: Red
      // R=255, G=0, B=0
      expect(parade.r[255 * 8 + 2]).toBe(1);
      expect(parade.g[0 * 8 + 2]).toBe(1);
      expect(parade.b[0 * 8 + 2]).toBe(1);
    });
  });

  describe('computeVectorscope', () => {
    it('maps distinct colors to different regions', () => {
      const scope = computeVectorscope(imageData, 256);

      expect(scope.size).toBe(256);

      // We expect 8 total hits (one per pixel)
      let sum = 0;
      for (let i = 0; i < scope.data.length; i++) {
        sum += scope.data[i];
      }
      expect(sum).toBe(8);

      // Both Black and White map to center (Cb=0, Cr=0) -> (128, 128)
      const centerIdx = 128 * 256 + 128;
      expect(scope.data[centerIdx]).toBeGreaterThanOrEqual(1);
    });
  });

});
