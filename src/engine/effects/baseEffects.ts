import blurWgsl from '../shaders/blur.wgsl?raw';
import lumaKeyWgsl from '../shaders/luma_key.wgsl?raw';
import chromaKeyWgsl from '../shaders/chroma_key.wgsl?raw';
import blendModesWgsl from '../shaders/blend_modes.wgsl?raw';

import { Transform, Effect } from '../../types/timeline';
import { computeTransformMatrix } from '../transforms';

export interface BaseEffectRenderOptions {
  width: number;
  height: number;
  transform?: Transform;
  effect: Effect;
  inputTexture: any; // GPUTexture from WebGPU
  blendTexture?: any; // Only for blend modes
}

export class EffectRenderer {
  private device: any = null;
  private blurPipeline: any = null;
  private lumaKeyPipeline: any = null;
  private chromaKeyPipeline: any = null;
  private blendPipeline: any = null;

  private sampler: any = null;
  private isInitialized = false;

  async init(device: any, _context: any): Promise<boolean> {
    if (!device || !_context) return false;
    this.device = device;

    try {
      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

      this.sampler = this.device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      // BLUR Pipeline
      const blurShader = this.device.createShaderModule({ code: blurWgsl });
      this.blurPipeline = this.createStandardPipeline(blurShader, presentationFormat, 1);

      // LUMA KEY Pipeline
      const lumaShader = this.device.createShaderModule({ code: lumaKeyWgsl });
      this.lumaKeyPipeline = this.createStandardPipeline(lumaShader, presentationFormat, 1);

      // CHROMA KEY Pipeline
      const chromaShader = this.device.createShaderModule({ code: chromaKeyWgsl });
      this.chromaKeyPipeline = this.createStandardPipeline(chromaShader, presentationFormat, 1);

      // BLEND Pipeline
      const blendShader = this.device.createShaderModule({ code: blendModesWgsl });
      this.blendPipeline = this.createStandardPipeline(blendShader, presentationFormat, 2);

      this.isInitialized = true;
      return true;
    } catch (err) {
      console.error('Failed to initialize EffectRenderer:', err);
      return false;
    }
  }

  private createStandardPipeline(shaderModule: any, format: string, numTextures: number) {
    const entries: any[] = [];
    for (let i = 0; i < numTextures; i++) {
      entries.push({ binding: i, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } });
    }
    entries.push({ binding: numTextures, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });

    const bindGroupLayout = this.device.createBindGroupLayout({ entries });

    const uniformBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
      ]
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, uniformBindGroupLayout],
    });

    return this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: { module: shaderModule, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  public renderEffect(options: BaseEffectRenderOptions): any {
    if (!this.isInitialized) throw new Error("EffectRenderer not initialized");

    const { effect, width, height, transform, inputTexture, blendTexture } = options;

    // Output texture to render into
    const outputTexture = this.device.createTexture({
      size: [width, height, 1],
      format: navigator.gpu.getPreferredCanvasFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: outputTexture.createView(),
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }]
    });

    let pipeline: any = null;
    let bindGroupEntries: any[] = [];
    let uniformData: Float32Array;
    let bufferSize = 256; // Minimum alignment

    const tMat = transform
      ? computeTransformMatrix(transform, width / height)
      : computeTransformMatrix({ position: { x: 0.5, y: 0.5 }, scale: { x: 1, y: 1 }, rotation: 0, opacity: 1, anchorPoint: { x: 0.5, y: 0.5 } }, width / height);

    const opacity = transform?.opacity ?? 1.0;

    switch (effect.type) {
      case 'blur':
        pipeline = this.blurPipeline;
        bindGroupEntries = [
          { binding: 0, resource: inputTexture.createView() },
          { binding: 1, resource: this.sampler }
        ];

        uniformData = new Float32Array(24); // Needs to hold resolution
        uniformData.set(tMat, 0);
        uniformData[16] = opacity;
        uniformData[17] = 0; // padding to align vec2 to 8 bytes. Actually offset 16 is opacity (4 bytes), offset 17 is padding?
        // WGSL struct layout:
        // transform: mat4x4<f32> (64 bytes, offset 0-63, Float32Array indices 0-15)
        // opacity: f32 (4 bytes, offset 64, Float32Array index 16)
        // (padding 4 bytes to align next vec2, offset 68, Float32Array index 17)
        // direction: vec2<f32> (8 bytes, offset 72, Float32Array indices 18-19)
        // resolution: vec2<f32> (8 bytes, offset 80, Float32Array indices 20-21)
        // radius: f32 (4 bytes, offset 88, Float32Array index 22)
        uniformData[18] = (effect.params.directionX as number) ?? 1.0;
        uniformData[19] = (effect.params.directionY as number) ?? 0.0;
        uniformData[20] = width;
        uniformData[21] = height;
        uniformData[22] = (effect.params.radius as number) ?? 5.0;
        bufferSize = 256;
        break;

      case 'luma_key':
        pipeline = this.lumaKeyPipeline;
        bindGroupEntries = [
          { binding: 0, resource: inputTexture.createView() },
          { binding: 1, resource: this.sampler }
        ];

        uniformData = new Float32Array(20);
        uniformData.set(tMat, 0);
        uniformData[16] = opacity;
        uniformData[17] = (effect.params.threshold as number) ?? 0.5;
        uniformData[18] = (effect.params.softness as number) ?? 0.1;
        uniformData[19] = (effect.params.invert as number) ?? 0.0;
        break;

      case 'chroma_key': {
        pipeline = this.chromaKeyPipeline;
        bindGroupEntries = [
          { binding: 0, resource: inputTexture.createView() },
          { binding: 1, resource: this.sampler }
        ];

        uniformData = new Float32Array(28);
        uniformData.set(tMat, 0);
        uniformData[16] = opacity; // offset 64
        // offset 68-79 padding (12 bytes, indices 17-19) to align vec3<f32> (16 bytes align, offset 80)

        const keyColor = (effect.params.key_color as number[]) ?? [0.0, 1.0, 0.0];
        uniformData[20] = keyColor[0]; // offset 80
        uniformData[21] = keyColor[1]; // offset 84
        uniformData[22] = keyColor[2]; // offset 88
        // offset 92 is padding for vec3 (index 23)

        uniformData[24] = (effect.params.similarity as number) ?? 0.4; // offset 96
        uniformData[25] = (effect.params.smoothness as number) ?? 0.08; // offset 100
        uniformData[26] = (effect.params.spill as number) ?? 0.1; // offset 104
        break;
      }

      case 'blend':
        pipeline = this.blendPipeline;
        if (!blendTexture) throw new Error("Blend effect requires a blendTexture");

        bindGroupEntries = [
          { binding: 0, resource: inputTexture.createView() }, // base
          { binding: 1, resource: blendTexture.createView() }, // blend
          { binding: 2, resource: this.sampler }
        ];

        uniformData = new Float32Array(20);
        uniformData.set(tMat, 0);
        uniformData[16] = opacity;
        uniformData[17] = (effect.params.mode as number) ?? 0.0; // 0=Over, 1=Multiply, 2=Screen, 3=Overlay
        break;

      default:
        throw new Error(`Unsupported effect type: ${effect.type}`);
    }

    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: bindGroupEntries
    });

    const uniformBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Copy data up to its length
    const paddedData = new Float32Array(bufferSize / 4);
    paddedData.set(uniformData, 0);

    this.device.queue.writeBuffer(uniformBuffer, 0, paddedData);

    const uniformBindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setBindGroup(1, uniformBindGroup);
    passEncoder.draw(6, 1, 0, 0); // Always 6 vertices for a quad
    passEncoder.end();

    this.device.queue.submit([commandEncoder.finish()]);

    // Zero-copy rule: Release uniform buffer immediately
    uniformBuffer.destroy();

    // Caller is responsible for destroying inputTexture and blendTexture,
    // and the returned outputTexture when they are done with it.

    return outputTexture;
  }
}
