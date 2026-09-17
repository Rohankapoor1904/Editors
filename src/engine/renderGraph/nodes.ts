import { RenderNode, RenderContext } from './RenderNode';
import { Clip, Transform, Effect } from '../../types/timeline';
import { getRuntimeMode, NotImplementedError } from '../../services/runtimeConfig';
import { compareRational, addRational } from '../../types/time';

export class ClipNode extends RenderNode {
  public clip: Clip;

  constructor(id: string, clip: Clip) {
    super(id);
    this.clip = clip;
  }

  public updateClip(clip: Clip) {
    this.clip = clip;
    this.invalidate();
  }

  protected async process(context: RenderContext, _inputs: any[]): Promise<any> {
    if (getRuntimeMode() === 'live') {
      throw new NotImplementedError('ClipNode rendering (WebGPU/WGSL) is not implemented in live mode');
    }

    // Check if clip is active at current timecode
    const start = this.clip.startOffset;
    const end = addRational(this.clip.startOffset, this.clip.duration);

    if (compareRational(context.timecode, start) < 0 || compareRational(context.timecode, end) >= 0) {
      return null; // Not active
    }

    // Return a mocked surface representing the clip for evaluation
    return { type: 'clip', clipId: this.clip.id, timecode: context.timecode };
  }
}

export class TransformNode extends RenderNode {
  public transform: Transform;

  constructor(id: string, transform: Transform) {
    super(id);
    this.transform = transform;
  }

  public updateTransform(transform: Transform) {
    this.transform = transform;
    this.invalidate();
  }

  protected async process(_context: RenderContext, inputs: any[]): Promise<any> {
    if (getRuntimeMode() === 'live') {
      throw new NotImplementedError('TransformNode rendering (WebGPU/WGSL) is not implemented in live mode');
    }
    const input = inputs[0]; // Transform node expects 1 input
    if (input === null) return null;
    return { type: 'transform', transform: this.transform, input };
  }
}

export class EffectNode extends RenderNode {
  public effect: Effect;

  constructor(id: string, effect: Effect) {
    super(id);
    this.effect = effect;
  }

  public updateEffect(effect: Effect) {
    this.effect = effect;
    this.invalidate();
  }

  protected async process(_context: RenderContext, inputs: any[]): Promise<any> {
    if (getRuntimeMode() === 'live') {
      throw new NotImplementedError('EffectNode rendering (WebGPU/WGSL) is not implemented in live mode');
    }
    const input = inputs[0]; // Effect node expects 1 input
    if (input === null) return null;
    if (!this.effect.enabled) return input;

    return { type: 'effect', effect: this.effect, input };
  }
}

export class MixerNode extends RenderNode {
  constructor(id: string) {
    super(id);
  }

  protected async process(_context: RenderContext, inputs: any[]): Promise<any> {
    if (getRuntimeMode() === 'live') {
      throw new NotImplementedError('MixerNode rendering (WebGPU/WGSL) is not implemented in live mode');
    }
    const activeInputs = inputs.filter(i => i !== null);
    // Mixer node combines all inputs (layers)
    return { type: 'mixer', inputs: activeInputs };
  }
}
