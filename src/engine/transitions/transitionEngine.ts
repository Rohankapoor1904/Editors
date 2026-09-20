import transitionsWgsl from '../shaders/transitions.wgsl?raw';

export enum TransitionType {
  CrossDissolve = 0,
  DipToBlack = 1,
  DipToWhite = 2,
  WipeLeft = 3,
  WipeRight = 4,
  WipeUp = 5,
  WipeDown = 6,
}

export interface TransitionRenderOptions {
  width: number;
  height: number;
  progress: number; // 0.0 to 1.0
  type: TransitionType;
  feather?: number; // Softness of wipe edge, e.g. 0.02
  textureA: GPUTexture;
  textureB: GPUTexture;
  outputTexture?: GPUTexture;
}

const ShaderStage = typeof GPUShaderStage !== 'undefined' ? GPUShaderStage : { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const TextureUsage = typeof GPUTextureUsage !== 'undefined' ? GPUTextureUsage : {
  COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16
};
const BufferUsage = typeof GPUBufferUsage !== 'undefined' ? GPUBufferUsage : { UNIFORM: 64, COPY_DST: 8 };

/**
 * Packs TransitionUniforms into a Float32Array compatible with WebGPU std140 layout (16 bytes):
 * - progress: f32 (4 bytes)
 * - transitionType: u32 (4 bytes, stored in uint32 view)
 * - feather: f32 (4 bytes)
 * - _padding: f32 (4 bytes)
 */
export function packTransitionUniforms(
  progress: number,
  type: TransitionType,
  feather: number = 0.02
): ArrayBuffer {
  const buffer = new ArrayBuffer(16);
  const floatView = new Float32Array(buffer);
  const uintView = new Uint32Array(buffer);

  floatView[0] = Math.max(0, Math.min(1, progress));
  uintView[1] = type;
  floatView[2] = Math.max(0.001, feather);
  floatView[3] = 0.0; // padding

  return buffer;
}

export class TransitionEngine {
  private device: GPUDevice | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private isInitialized = false;

  public getShaderCode(): string {
    return transitionsWgsl;
  }

  public isReady(): boolean {
    return this.isInitialized && this.pipeline !== null;
  }

  async init(device: GPUDevice, presentationFormat?: GPUTextureFormat): Promise<boolean> {
    if (!device) return false;
    this.device = device;

    try {
      const format = presentationFormat || navigator.gpu?.getPreferredCanvasFormat() || 'bgra8unorm';

      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      const shaderModule = this.device.createShaderModule({
        label: 'Transitions WGSL Shader Module',
        code: transitionsWgsl,
      });

      // Bind group 0: 2 textures + 1 sampler
      const textureBindGroupLayout = this.device.createBindGroupLayout({
        label: 'Transitions Textures Bind Group Layout',
        entries: [
          { binding: 0, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 1, visibility: ShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 2, visibility: ShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      });

      // Bind group 1: uniform buffer (16 bytes)
      const uniformBindGroupLayout = this.device.createBindGroupLayout({
        label: 'Transitions Uniforms Bind Group Layout',
        entries: [
          { binding: 0, visibility: ShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      });

      const pipelineLayout = this.device.createPipelineLayout({
        label: 'Transitions Pipeline Layout',
        bindGroupLayouts: [textureBindGroupLayout, uniformBindGroupLayout],
      });

      this.pipeline = this.device.createRenderPipeline({
        label: 'Transitions Render Pipeline',
        layout: pipelineLayout,
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main',
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [{ format }],
        },
        primitive: {
          topology: 'triangle-list',
        },
      });

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('[TransitionEngine] Initialization failed:', err);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Renders the transition between textureA and textureB at the given progress.
   * Adheres to Invariant 6: Zero-copy lifetime. Uniform buffers are cleanly destroyed.
   */
  public renderTransition(options: TransitionRenderOptions): GPUTexture {
    if (!this.isInitialized || !this.device || !this.pipeline || !this.sampler) {
      throw new Error('[TransitionEngine] Not initialized. Call init(device) first.');
    }

    const { width, height, progress, type, feather, textureA, textureB } = options;

    const outputTexture = options.outputTexture ?? this.device.createTexture({
      size: [width, height, 1],
      format: navigator.gpu?.getPreferredCanvasFormat() || 'bgra8unorm',
      usage: TextureUsage.RENDER_ATTACHMENT | TextureUsage.TEXTURE_BINDING | TextureUsage.COPY_SRC,
    });

    const commandEncoder = this.device.createCommandEncoder({ label: 'Transition Command Encoder' });

    // Texture Bind Group
    const textureBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: textureA.createView() },
        { binding: 1, resource: textureB.createView() },
        { binding: 2, resource: this.sampler },
      ],
    });

    // Uniform Buffer (16 bytes aligned)
    const uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: BufferUsage.UNIFORM | BufferUsage.COPY_DST,
    });

    const packed = packTransitionUniforms(progress, type, feather);
    this.device.queue.writeBuffer(uniformBuffer, 0, packed);

    const uniformBindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
      ],
    });

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: outputTexture.createView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, textureBindGroup);
    renderPass.setBindGroup(1, uniformBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Zero-copy invariant: Clean up transient uniform buffer immediately
    uniformBuffer.destroy();

    return outputTexture;
  }
}

export const transitionEngine = new TransitionEngine();
