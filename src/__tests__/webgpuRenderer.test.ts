import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGPURendererEngine } from '../engine/webgpuRenderer';
import { setRuntimeMode } from '../services/runtimeConfig';

// Mock WebGPU types for tests
(global as any).GPUBufferUsage = { UNIFORM: 64, COPY_DST: 8 };
  globalThis.GPUShaderStage = {
  VERTEX: 1,
  FRAGMENT: 2,
  COMPUTE: 4,
};

(global as any).GPUTextureUsage = {
  COPY_SRC: 1,
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  STORAGE_BINDING: 8,
  RENDER_ATTACHMENT: 16,
};

describe('WebGPURendererEngine', () => {
  let engine: WebGPURendererEngine;
  let mockCanvas: HTMLCanvasElement;
  let mockContext: any;
  let mockDevice: any;
  let mockAdapter: any;

  beforeEach(() => {
    setRuntimeMode('demo');
    engine = new WebGPURendererEngine();

    mockContext = {
      configure: vi.fn(),
      getCurrentTexture: vi.fn().mockReturnValue({
        createView: vi.fn().mockReturnValue({}),
      }),
    };

    mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockContext),
    } as any;

    mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createBindGroupLayout: vi.fn().mockReturnValue({}),
      createPipelineLayout: vi.fn().mockReturnValue({}),
      createRenderPipeline: vi.fn().mockReturnValue({
        getBindGroupLayout: vi.fn().mockReturnValue({}),
      }),
      createBuffer: vi.fn().mockReturnValue({ destroy: vi.fn() }),
      createCommandEncoder: vi.fn().mockReturnValue({
        beginRenderPass: vi.fn().mockReturnValue({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        }),
        finish: vi.fn(),
      }),
      createTexture: vi.fn().mockReturnValue({
        createView: vi.fn().mockReturnValue({}),
        destroy: vi.fn(),
      }),
      createSampler: vi.fn().mockReturnValue({}),
      createBindGroup: vi.fn().mockReturnValue({}),
      queue: {
        writeBuffer: vi.fn(),
        submit: vi.fn(),
        writeTexture: vi.fn(),
      }
    };

    mockAdapter = {
      requestDevice: vi.fn().mockResolvedValue(mockDevice),
    };

    Object.defineProperty(global, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(mockAdapter),
          getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm'),
        },
      },
      writable: true,
    });
  });

  it('creates shader module and pipeline on initialization', async () => {
    const success = await engine.init(mockCanvas);
    expect(success).toBe(true);
    expect(mockDevice.createShaderModule).toHaveBeenCalled();
    expect(mockDevice.createRenderPipeline).toHaveBeenCalled();
    expect(mockDevice.createSampler).toHaveBeenCalled();
  });

  it('renders a frame using the pipeline and releases textures', async () => {
    await engine.init(mockCanvas);

    const yuvData = {
      y: new Uint8Array([255, 255, 255, 255]),
      u: new Uint8Array([128]),
      v: new Uint8Array([128]),
    };

    engine.renderFrame({ width: 2, height: 2, timecode: 0, yuvData });

    // Validate texture creation
    expect(mockDevice.createTexture).toHaveBeenCalledTimes(4);

    // Validate bind group and pipeline execution
    const encoder = mockDevice.createCommandEncoder.mock.results[0].value;
    const pass = encoder.beginRenderPass.mock.results[0].value;

    expect(pass.setPipeline).toHaveBeenCalled();
    expect(pass.setBindGroup).toHaveBeenCalled();
    expect(pass.draw).toHaveBeenCalledWith(6, 1, 0, 0);

    // Zero-copy rule: validate textures are destroyed
    const mockTexture = mockDevice.createTexture.mock.results[0].value;
    expect(mockTexture.destroy).toHaveBeenCalled();
  });

  it('compiles curves/secondary/mask WGSL stages and uploads their uniforms (R24.1/R24.2)', async () => {
    await engine.init(mockCanvas);

    const code = mockDevice.createShaderModule.mock.calls[0][0].code as string;
    expect(code).toContain('apply_curves');
    expect(code).toContain('secondary_weight');
    expect(code).toContain('mask_alpha');

    const yuvData = {
      y: new Uint8Array([255, 255, 255, 255]),
      u: new Uint8Array([128]),
      v: new Uint8Array([128]),
    };

    engine.renderFrame({
      width: 2,
      height: 2,
      timecode: 0,
      yuvData,
      colorSettings: {
        lift: { r: 0, g: 0, b: 0 },
        gamma: { r: 1, g: 1, b: 1 },
        gain: { r: 1, g: 1, b: 1 },
        offset: { r: 0, g: 0, b: 0 },
        curves: { master: [{ input: 0, output: 0 }, { input: 1, output: 0.5 }] },
        secondarySelection: {
          hueCenter: 0, hueWidth: 0.1, hueSoftness: 0,
          satMin: 0.5, satMax: 1, lumaMin: 0, lumaMax: 1, boxSoftness: 0,
        },
        secondaryGrade: { lift: { r: 0, g: 0, b: 0 }, gain: { r: 0.5, g: 1, b: 1 } },
      },
      mask: {
        id: 'mask-1', shape: 'rect', subjectClass: 'custom',
        centerX: 0.25, centerY: 0.5, sizeX: 0.5, sizeY: 1,
      },
    });

    const colorWrites = mockDevice.queue.writeBuffer.mock.calls.filter(
      (call: unknown[]) => call[2] instanceof Float32Array && (call[2] as Float32Array).length === 316
    );
    expect(colorWrites.length).toBeGreaterThan(0);
    const colorData = colorWrites[colorWrites.length - 1][2] as Float32Array;
    expect(colorData[280]).toBe(1); // curves enabled
    expect(colorData[287]).toBe(1); // secondary enabled
    expect(colorData[311]).toBe(1); // mask enabled
    expect(colorData[312]).toBe(0); // rect shape flag
    expect(colorData[304]).toBeCloseTo(0.25, 12); // mask cx
    // Baked master-halve LUT: first node 0, last node 0.5 (red channel).
    expect(colorData[24]).toBeCloseTo(0, 12);
    expect(colorData[24 + 63 * 4]).toBeCloseTo(0.5, 12);

    // Legacy path: no extras -> all three stages disabled, same buffer shape.
    engine.renderFrame({ width: 2, height: 2, timecode: 0, yuvData });
    const legacyWrites = mockDevice.queue.writeBuffer.mock.calls.filter(
      (call: unknown[]) => call[2] instanceof Float32Array && (call[2] as Float32Array).length === 316
    );
    const legacy = legacyWrites[legacyWrites.length - 1][2] as Float32Array;
    expect(legacy[280]).toBe(0);
    expect(legacy[287]).toBe(0);
    expect(legacy[311]).toBe(0);
  });
});
