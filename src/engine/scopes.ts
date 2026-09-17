export interface HistogramData {
  r: Uint32Array; // 256 bins
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  maxCount: number;
}

export interface RGBParadeData {
  r: Uint32Array; // [width * 256] array, flattened 2D grid
  g: Uint32Array;
  b: Uint32Array;
  width: number;
  height: number;
  maxCount: number;
}

export interface VectorscopeData {
  data: Uint32Array; // [size * size] array (e.g. 256x256 UV grid)
  size: number;
  maxCount: number;
}

export function computeHistogram(imageData: ImageData): HistogramData {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const luma = new Uint32Array(256);

  const data = imageData.data;
  let maxCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];

    // Rec. 709 luma
    const y = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    const clampedY = Math.min(255, Math.max(0, y));

    r[red]++;
    g[green]++;
    b[blue]++;
    luma[clampedY]++;

    if (r[red] > maxCount) maxCount = r[red];
    if (g[green] > maxCount) maxCount = g[green];
    if (b[blue] > maxCount) maxCount = b[blue];
    if (luma[clampedY] > maxCount) maxCount = luma[clampedY];
  }

  return { r, g, b, luma, maxCount };
}

export function computeRGBParade(imageData: ImageData, targetWidth: number = 256): RGBParadeData {
  const width = targetWidth;
  const height = 256;
  const r = new Uint32Array(width * height);
  const g = new Uint32Array(width * height);
  const b = new Uint32Array(width * height);

  const data = imageData.data;
  const sourceWidth = imageData.width;
  let maxCount = 0;

  // For each pixel in the source image
  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < sourceWidth; x++) {
      const idx = (y * sourceWidth + x) * 4;
      const red = data[idx];
      const green = data[idx + 1];
      const blue = data[idx + 2];

      // Map source x to target column
      const targetX = Math.floor((x / sourceWidth) * width);

      const rIdx = red * width + targetX;
      const gIdx = green * width + targetX;
      const bIdx = blue * width + targetX;

      r[rIdx]++;
      g[gIdx]++;
      b[bIdx]++;

      if (r[rIdx] > maxCount) maxCount = r[rIdx];
      if (g[gIdx] > maxCount) maxCount = g[gIdx];
      if (b[bIdx] > maxCount) maxCount = b[bIdx];
    }
  }

  return { r, g, b, width, height, maxCount };
}

export function computeVectorscope(imageData: ImageData, targetSize: number = 256): VectorscopeData {
  const size = targetSize;
  const dataOut = new Uint32Array(size * size);

  const data = imageData.data;
  let maxCount = 0;

  const center = size / 2;
  const scale = (size / 2) - 1; // leave 1 pixel border

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255.0;
    const g = data[i + 1] / 255.0;
    const b = data[i + 2] / 255.0;

    // YCbCr / YUV mapping (using SD/HD approximation for display)
    const cb = -0.148 * r - 0.291 * g + 0.439 * b; // U
    const cr = 0.439 * r - 0.368 * g - 0.071 * b;  // V

    // Scale to -1.0 to 1.0 (Cb and Cr are roughly in -0.5 to 0.5 range)
    // We multiply by 2 so they fit nicely in the vectorscope circle
    const uScale = cb * 2.0;
    const vScale = cr * 2.0;

    let x = Math.round(center + uScale * scale);
    let y = Math.round(center - vScale * scale); // Invert Y for canvas coordinate system

    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));

    const idx = y * size + x;
    dataOut[idx]++;
    if (dataOut[idx] > maxCount) maxCount = dataOut[idx];
  }

  return { data: dataOut, size, maxCount };
}
