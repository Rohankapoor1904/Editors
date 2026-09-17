import { RenderNode, RenderContext } from './RenderNode';

export class RenderGraph {
  private nodes: Map<string, RenderNode> = new Map();
  private outputNode: RenderNode | null = null;

  /**
   * Adds a node to the graph.
   */
  public addNode(node: RenderNode) {
    this.nodes.set(node.id, node);
  }

  /**
   * Removes a node from the graph.
   */
  public removeNode(id: string) {
    this.nodes.delete(id);
  }

  /**
   * Retrieves a node by ID.
   */
  public getNode(id: string): RenderNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Sets the final output node of the graph.
   */
  public setOutputNode(node: RenderNode) {
    this.addNode(node);
    this.outputNode = node;
  }

  public getOutputNode(): RenderNode | null {
    return this.outputNode;
  }

  /**
   * Invalidates the entire graph.
   */
  public invalidateAll() {
    for (const node of this.nodes.values()) {
      node.invalidate();
    }
  }

  /**
   * Evaluates the graph from the output node.
   */
  public async evaluate(context: RenderContext): Promise<any> {
    if (!this.outputNode) {
      throw new Error("RenderGraph has no output node set.");
    }
    return this.outputNode.evaluate(context);
  }
}
