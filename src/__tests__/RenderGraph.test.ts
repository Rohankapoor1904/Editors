import { setRuntimeMode } from '../services/runtimeConfig';
import { describe, it, expect } from 'vitest';
import { RenderGraph } from '../engine/renderGraph/RenderGraph';
import { RenderContext, RenderNode } from '../engine/renderGraph/RenderNode';
import { secondsToRational } from '../types/time';

describe('RenderGraph', () => {
  setRuntimeMode('demo');

  const dummyContext: RenderContext = { timecode: secondsToRational(0), width: 1920, height: 1080 };

  it('two clips sharing an upstream effect node evaluate that node once', async () => {
    class TestNode extends RenderNode {
      constructor(id: string) {
        super(id);
      }
      protected async process(_context: RenderContext, inputs: any[]): Promise<any> {
        return { id: this.id, inputs };
      }
    }

    const graph = new RenderGraph();

    // Create shared node (upstream)
    const sharedNode = new TestNode('shared');
    graph.addNode(sharedNode);

    // Create two downstream nodes that depend on the shared node
    const node1 = new TestNode('downstream-1');
    const node2 = new TestNode('downstream-2');

    graph.addNode(node1);
    graph.addNode(node2);

    node1.addInput(sharedNode);
    node2.addInput(sharedNode);

    const mixerNode = new TestNode('mixer');
    mixerNode.addInput(node1);
    mixerNode.addInput(node2);

    graph.setOutputNode(mixerNode);

    // First evaluation
    await graph.evaluate(dummyContext);

    // Shared node should only be evaluated once despite being input to two clips
    expect(sharedNode.getEvaluateCount()).toBe(1);

    // If we evaluate again without invalidation, it shouldn't evaluate again.
    await graph.evaluate(dummyContext);
    expect(sharedNode.getEvaluateCount()).toBe(1);

    // Invalidate node1 (downstream of effect)
    node1.invalidate();
    await graph.evaluate(dummyContext);

    // The shared node shouldn't be evaluated again because it wasn't dirty!
    expect(sharedNode.getEvaluateCount()).toBe(1);
    expect(node1.getEvaluateCount()).toBe(2);
  });

  it('changing a downstream parameter invalidates only affected nodes', async () => {
    class TestNode extends RenderNode {
      constructor(id: string) {
        super(id);
      }
      protected async process(_context: RenderContext, inputs: any[]): Promise<any> {
        return { id: this.id, inputs };
      }
    }

    const graph = new RenderGraph();

    const node1 = new TestNode('node-1');
    const node2 = new TestNode('node-2');

    const node1Child = new TestNode('node-1-child');
    node1Child.addInput(node1);

    const node2Child = new TestNode('node-2-child');
    node2Child.addInput(node2);

    const mixerNode = new TestNode('mixer');
    mixerNode.addInput(node1Child);
    mixerNode.addInput(node2Child);

    graph.setOutputNode(mixerNode);

    // Initial evaluation
    await graph.evaluate(dummyContext);

    expect(node1.getEvaluateCount()).toBe(1);
    expect(node1Child.getEvaluateCount()).toBe(1);
    expect(node2.getEvaluateCount()).toBe(1);
    expect(node2Child.getEvaluateCount()).toBe(1);
    expect(mixerNode.getEvaluateCount()).toBe(1);

    // Invalidate a downstream node (node1Child)
    node1Child.invalidate();

    // Re-evaluate
    await graph.evaluate(dummyContext);

    // Only node1Child and mixer should have been re-evaluated!
    expect(node1Child.getEvaluateCount()).toBe(2);
    expect(mixerNode.getEvaluateCount()).toBe(2);

    // node1, node2, node2Child should NOT have been re-evaluated
    expect(node1.getEvaluateCount()).toBe(1);
    expect(node2.getEvaluateCount()).toBe(1);
    expect(node2Child.getEvaluateCount()).toBe(1);
  });
});
