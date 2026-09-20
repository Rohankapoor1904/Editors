import { describe, it, expect, vi } from 'vitest';
import {
  TransitionEngine,
  TransitionType,
  packTransitionUniforms,
  transitionEngine,
} from '../engine/transitions/transitionEngine';
import { webgpuEngine } from '../engine/webgpuRenderer';

(global as any).GPUBufferUsage = { UNIFORM: 64, COPY_DST: 8 };
globalThis.GPUShaderStage = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
(global as any).GPUTextureUsage = {
  COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16
};

describe('GPU Video Transitions Engine (Task R13.4)', () => {
  describe('packTransitionUniforms', () => {
    it('correctly packs uniforms into 16-byte std140 layout', () => {
      const buffer = packTransitionUniforms(0.75, TransitionType.DipToBlack, 0.05);
      expect(buffer.byteLength).toBe(16);

      const floatView = new Float32Array(buffer);
      const uintView = new Uint32Array(buffer);

      // progress is float 0
      expect(floatView[0]).toBeCloseTo(0.75);
      // transitionType is uint 1
      expect(uintView[1]).toBe(TransitionType.DipToBlack);
      // feather is float 2
      expect(floatView[2]).toBeCloseTo(0.05);
      // padding is float 3
      expect(floatView[3]).toBe(0.0);
    });

    it('clamps progress between 0.0 and 1.0', () => {
      const underBuffer = packTransitionUniforms(-0.5, TransitionType.CrossDissolve);
      expect(new Float32Array(underBuffer)[0]).toBe(0.0);

      const overBuffer = packTransitionUniforms(1.5, TransitionType.CrossDissolve);
      expect(new Float32Array(overBuffer)[0]).toBe(1.0);
    });

    it('clamps feather to a minimum of 0.001', () => {
      const zeroFeather = packTransitionUniforms(0.5, TransitionType.WipeLeft, 0.0);
      expect(new Float32Array(zeroFeather)[2]).toBeCloseTo(0.001);
    });
  });

  describe('WGSL Shader Validation', () => {
    it('contains valid WGSL structure with vertex and fragment entry points', () => {
      const engine = new TransitionEngine();
      const code = engine.getShaderCode();

      expect(code).toBeDefined();
      expect(code).toContain('@vertex');
      expect(code).toContain('fn vs_main');
      expect(code).toContain('@fragment');
      expect(code).toContain('fn fs_main');
      expect(code).toContain('struct TransitionUniforms');
      expect(code).toContain('transitionType: u32');
    });

    it('implements all transition types in shader code', () => {
      const code = transitionEngine.getShaderCode();

      // Case 0: CrossDissolve
      expect(code).toContain('case 0u');
      // Case 1: DipToBlack
      expect(code).toContain('case 1u');
      // Case 2: DipToWhite
      expect(code).toContain('case 2u');
      // Case 3: WipeLeft
      expect(code).toContain('case 3u');
      // Case 4: WipeRight
      expect(code).toContain('case 4u');
      // Case 5: WipeUp
      expect(code).toContain('case 5u');
      // Case 6: WipeDown
      expect(code).toContain('case 6u');
    });
  });

  describe('Pipeline Lifecycle & Zero-Copy Execution', () => {
    it('initializes WebGPU pipeline and executes renderTransition with buffer destruction', async () => {
      const mockDestroy = vi.fn();
      const mockDraw = vi.fn();
      const mockSetPipeline = vi.fn();
      const mockSetBindGroup = vi.fn();
      const mockEnd = vi.fn();
      const mockSubmit = vi.fn();
      const mockWriteBuffer = vi.fn();

      const mockDevice: any = {
        createSampler: vi.fn().mockReturnValue({}),
        createShaderModule: vi.fn().mockReturnValue({}),
        createBindGroupLayout: vi.fn().mockReturnValue({}),
        createPipelineLayout: vi.fn().mockReturnValue({}),
        createRenderPipeline: vi.fn().mockReturnValue({
          getBindGroupLayout: vi.fn().mockReturnValue({}),
        }),
        createTexture: vi.fn().mockReturnValue({
          createView: vi.fn().mockReturnValue({}),
        }),
        createBuffer: vi.fn().mockReturnValue({
          destroy: mockDestroy,
        }),
        createBindGroup: vi.fn().mockReturnValue({}),
        createCommandEncoder: vi.fn().mockReturnValue({
          beginRenderPass: vi.fn().mockReturnValue({
            setPipeline: mockSetPipeline,
            setBindGroup: mockSetBindGroup,
            draw: mockDraw,
            end: mockEnd,
          }),
          finish: vi.fn().mockReturnValue({}),
        }),
        queue: {
          writeBuffer: mockWriteBuffer,
          submit: mockSubmit,
        },
      };

      const engine = new TransitionEngine();
      const success = await engine.init(mockDevice, 'bgra8unorm');
      expect(success).toBe(true);
      expect(engine.isReady()).toBe(true);

      const dummyTextureA: any = { createView: vi.fn() };
      const dummyTextureB: any = { createView: vi.fn() };

      const result = engine.renderTransition({
        width: 1920,
        height: 1080,
        progress: 0.5,
        type: TransitionType.CrossDissolve,
        textureA: dummyTextureA,
        textureB: dummyTextureB,
      });

      expect(result).toBeDefined();
      expect(mockSetPipeline).toHaveBeenCalled();
      expect(mockSetBindGroup).toHaveBeenCalledTimes(2);
      expect(mockDraw).toHaveBeenCalledWith(6, 1, 0, 0);
      expect(mockEnd).toHaveBeenCalled();
      expect(mockSubmit).toHaveBeenCalled();

      // Zero-copy verification: uniform buffer must be destroyed after submission
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('throws error if renderTransition called before initialization', () => {
      const engine = new TransitionEngine();
      expect(() => {
        engine.renderTransition({} as any);
      }).toThrowError(/Not initialized/);
    });

    it('integrates cleanly with webgpuEngine', () => {
      expect(webgpuEngine.getTransitionEngine()).toBeDefined();
      expect(typeof webgpuEngine.renderTransition).toBe('function');
    });
  });
});
