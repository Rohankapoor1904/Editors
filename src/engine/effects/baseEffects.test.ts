import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EffectRenderer } from './baseEffects';
import { Effect } from '../../types/timeline';

(global as any).GPUBufferUsage = { UNIFORM: 64, COPY_DST: 8 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
(global as any).GPUTextureUsage = {
  COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16
};

describe('EffectRenderer (Base Effects WGSL)', () => {
  let renderer: EffectRenderer;
  let mockDevice: any;
  let mockContext: any;

  beforeEach(() => {
    renderer = new EffectRenderer();

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

    mockContext = {};

    Object.defineProperty(global, 'navigator', {
      value: { gpu: { getPreferredCanvasFormat: vi.fn().mockReturnValue('bgra8unorm') } },
      writable: true,
    });
  });

  it('creates shader modules and pipelines on initialization', async () => {
    const success = await renderer.init(mockDevice, mockContext);
    expect(success).toBe(true);

    // Blur, Luma Key, Chroma Key, Blend Modes
    expect(mockDevice.createShaderModule).toHaveBeenCalledTimes(4);
    expect(mockDevice.createRenderPipeline).toHaveBeenCalledTimes(4);
  });

  it('executes the blur effect pipeline using a 6-vertex quad and destroys uniform buffer', async () => {
    await renderer.init(mockDevice, mockContext);
    const effect: Effect = { id: 'eff1', type: 'blur', enabled: true, params: { radius: 10 } };
    const inputTex = mockDevice.createTexture();

    mockDevice.createCommandEncoder.mockClear();

    const outTex = renderer.renderEffect({
      width: 1920,
      height: 1080,
      effect,
      inputTexture: inputTex
    });

    expect(outTex).toBeDefined();

    const encoder = mockDevice.createCommandEncoder.mock.results[0].value;
    const pass = encoder.beginRenderPass.mock.results[0].value;
    expect(pass.draw).toHaveBeenCalledWith(6, 1, 0, 0);

    const mockBuffer = mockDevice.createBuffer.mock.results[0].value;
    expect(mockBuffer.destroy).toHaveBeenCalled(); // Zero-copy uniform buffer cleanup
  });

  it('executes the luma key effect', async () => {
    await renderer.init(mockDevice, mockContext);
    const effect: Effect = { id: 'eff1', type: 'luma_key', enabled: true, params: { threshold: 0.5, softness: 0.1 } };
    const inputTex = mockDevice.createTexture();

    mockDevice.createCommandEncoder.mockClear();

    renderer.renderEffect({ width: 1920, height: 1080, effect, inputTexture: inputTex });

    const encoder = mockDevice.createCommandEncoder.mock.results[0].value;
    const pass = encoder.beginRenderPass.mock.results[0].value;
    expect(pass.draw).toHaveBeenCalledWith(6, 1, 0, 0);
  });

  it('executes the chroma key effect', async () => {
    await renderer.init(mockDevice, mockContext);
    const effect: Effect = { id: 'eff1', type: 'chroma_key', enabled: true, params: { key_color: [0, 1, 0] } };
    const inputTex = mockDevice.createTexture();

    mockDevice.createCommandEncoder.mockClear();

    renderer.renderEffect({ width: 1920, height: 1080, effect, inputTexture: inputTex });

    const encoder = mockDevice.createCommandEncoder.mock.results[0].value;
    const pass = encoder.beginRenderPass.mock.results[0].value;
    expect(pass.draw).toHaveBeenCalledWith(6, 1, 0, 0);
  });

  it('executes the blend mode effect', async () => {
    await renderer.init(mockDevice, mockContext);
    const effect: Effect = { id: 'eff1', type: 'blend', enabled: true, params: { mode: 1 } }; // Multiply
    const inputTex = mockDevice.createTexture();
    const blendTex = mockDevice.createTexture();

    mockDevice.createCommandEncoder.mockClear();

    renderer.renderEffect({ width: 1920, height: 1080, effect, inputTexture: inputTex, blendTexture: blendTex });

    const encoder = mockDevice.createCommandEncoder.mock.results[0].value;
    const pass = encoder.beginRenderPass.mock.results[0].value;
    expect(pass.draw).toHaveBeenCalledWith(6, 1, 0, 0);
  });

  it('throws an error if a blend effect is requested without a blendTexture', async () => {
    await renderer.init(mockDevice, mockContext);
    const effect: Effect = { id: 'eff1', type: 'blend', enabled: true, params: { mode: 1 } };
    const inputTex = mockDevice.createTexture();

    expect(() => {
      renderer.renderEffect({ width: 1920, height: 1080, effect, inputTexture: inputTex });
    }).toThrow(/Blend effect requires a blendTexture/);
  });
});
