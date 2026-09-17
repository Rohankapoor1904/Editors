import { TimelineState } from '../../types/timeline';
import { RenderGraph } from './RenderGraph';
import { RenderNode } from './RenderNode';
import { ClipNode, TransformNode, EffectNode, MixerNode } from './nodes';

export function compileTimelineToDAG(timeline: TimelineState): RenderGraph {
  const graph = new RenderGraph();
  const mixer = new MixerNode('mixer-out');
  graph.setOutputNode(mixer);

  // We should ideally sort tracks by index so layers are ordered correctly
  const sortedTracks = [...timeline.tracks].sort((a, b) => a.index - b.index);

  for (const track of sortedTracks) {
    if (track.type !== 'video' || track.muted) continue;

    for (const clip of track.clips) {
      // Compiles the entire timeline. The nodes themselves are responsible for returning null if their time range does not overlap with the evaluated timecode context.
      let head: RenderNode = new ClipNode(`clip-${clip.id}`, clip);
      graph.addNode(head);

      // Add transform node if any
      if (clip.transform) {
        const transformNode = new TransformNode(`transform-${clip.id}`, clip.transform);
        transformNode.addInput(head);
        graph.addNode(transformNode);
        head = transformNode;
      }

      // Add effect nodes if any
      if (clip.effects && clip.effects.length > 0) {
        for (let i = 0; i < clip.effects.length; i++) {
          const effect = clip.effects[i];
          const effectNode = new EffectNode(`effect-${clip.id}-${effect.id}`, effect);
          effectNode.addInput(head);
          graph.addNode(effectNode);
          head = effectNode;
        }
      }

      // Feed into mixer
      mixer.addInput(head);
    }
  }

  return graph;
}
