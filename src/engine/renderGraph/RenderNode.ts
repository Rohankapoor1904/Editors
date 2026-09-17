import { RationalTime } from '../../types/time';

export interface RenderContext {
  timecode: RationalTime;
  width: number;
  height: number;
  // Other context data
}

/**
 * Base class for all nodes in the Render Graph.
 * Supports an N-ary input structure (dependencies), a dependents Set for downstream invalidation,
 * parameter storage, and a caching mechanism.
 */
export abstract class RenderNode {
  public id: string;

  // Nodes that provide input to this node.
  protected inputs: RenderNode[] = [];

  // Nodes that depend on this node's output. Used for cache invalidation.
  protected dependents: Set<RenderNode> = new Set();

  protected isDirty: boolean = true;
  protected cachedOutput: any = null;
  protected evaluatePromise: Promise<any> | null = null;
  protected evaluateCount: number = 0; // for testing/metrics

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Adds an input dependency to this node.
   */
  public addInput(node: RenderNode) {
    this.inputs.push(node);
    node.dependents.add(this);
    this.invalidate(); // Adding a new input invalidates our cache.
  }

  /**
   * Removes an input dependency from this node.
   */
  public removeInput(node: RenderNode) {
    const index = this.inputs.indexOf(node);
    if (index !== -1) {
      this.inputs.splice(index, 1);
      node.dependents.delete(this);
      this.invalidate();
    }
  }

  /**
   * Replaces all inputs with the new array.
   */
  public setInputs(nodes: RenderNode[]) {
    // Remove old dependents
    for (const input of this.inputs) {
      input.dependents.delete(this);
    }

    this.inputs = [...nodes];

    // Add new dependents
    for (const input of this.inputs) {
      input.dependents.add(this);
    }
    this.invalidate();
  }

  public getInputs(): RenderNode[] {
    return this.inputs;
  }

  /**
   * Invalidates this node's cache and propagates invalidation to all downstream dependents.
   */
  public invalidate() {
    if (this.isDirty) return; // Already dirty, stop propagation

    this.isDirty = true;
    this.cachedOutput = null;
    this.evaluatePromise = null;

    for (const dependent of this.dependents) {
      dependent.invalidate();
    }
  }

  /**
   * Evaluates the node if dirty, otherwise returns the cached output.
   */
  public async evaluate(context: RenderContext): Promise<any> {
    if (this.isDirty) {
      if (!this.evaluatePromise) {
        this.evaluateCount++;

        this.evaluatePromise = (async () => {
          // Evaluate all inputs first (DAG traversal)
          const inputResults = await Promise.all(
            this.inputs.map(input => input.evaluate(context))
          );

          const output = await this.process(context, inputResults);
          return output;
        })();
      }
      this.cachedOutput = await this.evaluatePromise;
      // Need to re-check isDirty as it could have been invalidated during await!
      // But typically render DAG evaluation is synchronous in its top-down trigger,
      // and we just want to avoid double evaluation.
      this.isDirty = false;
      this.evaluatePromise = null;
    }
    return this.cachedOutput;
  }

  /**
   * The actual processing logic implemented by concrete nodes.
   * @param context Global render context
   * @param inputs Results from all input nodes
   */
  protected abstract process(context: RenderContext, inputs: any[]): Promise<any>;

  public getEvaluateCount(): number {
    return this.evaluateCount;
  }
}
