import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGPURendererEngine } from '../engine/webgpuRenderer';

// Mock WebGPU types for tests
(global as any).GPUShaderStage = {
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
    expect(mockDevice.createTexture).toHaveBeenCalledTimes(3);

    // Validate bind group and pipeline execution
    const encoder = mockDevice.createCommandEncoder.mock.results[0].value;
    const pass = encoder.beginRenderPass.mock.results[0].value;

    expect(pass.setPipeline).toHaveBeenCalled();
    expect(pass.setBindGroup).toHaveBeenCalled();
    expect(pass.draw).toHaveBeenCalledWith(3, 1, 0, 0);

    // Zero-copy rule: validate textures are destroyed
    const mockTexture = mockDevice.createTexture.mock.results[0].value;
    expect(mockTexture.destroy).toHaveBeenCalled();
  });
});
