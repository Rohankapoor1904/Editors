import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransformGizmo } from '../TransformGizmo';
import { Clip } from '../../types/timeline';
import { secondsToRational } from '../../types/time';

describe('TransformGizmo On-Screen Canvas Controls (Task R13.2)', () => {
  const mockClip: Clip = {
    id: 'clip_video_01',
    assetId: 'asset_01',
    name: 'Interview.mp4',
    startOffset: secondsToRational(0),
    sourceIn: secondsToRational(0),
    sourceOut: secondsToRational(5),
    duration: secondsToRational(5),
    transform: {
      position: { x: 10, y: -20 },
      scale: { x: 1.2, y: 1.2 },
      rotation: 15,
      opacity: 1,
      anchorPoint: { x: 0.5, y: 0.5 }
    }
  };

  it('renders bounding box and coordinates tag accurately', () => {
    const onUpdate = vi.fn();
    render(
      <TransformGizmo
        clip={mockClip}
        containerWidth={600}
        containerHeight={400}
        onUpdateTransform={onUpdate}
      />
    );

    // Verify coordinate tag
    expect(screen.getByText(/X: 10 Y: -20 \| 120% \| 15°/)).toBeDefined();

    // Verify rotation button
    const rotateBtn = screen.getByTitle('Rotate Clip');
    expect(rotateBtn).toBeDefined();
  });

  it('allows moving the transform and triggers onUpdateTransform on pointer up', () => {
    const onUpdate = vi.fn();
    const { container } = render(
      <TransformGizmo
        clip={mockClip}
        containerWidth={600}
        containerHeight={400}
        onUpdateTransform={onUpdate}
      />
    );

    // Bounding box div has cursor-move
    const box = container.querySelector('.cursor-move');
    expect(box).toBeDefined();

    if (box) {
      fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(box, { clientX: 150, clientY: 120, pointerId: 1 });
      fireEvent.pointerUp(box, { pointerId: 1 });

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updated = onUpdate.mock.calls[0][0];
      expect(updated.position.x).toBe(10 + 50); // 10 + dx (50)
      expect(updated.position.y).toBe(-20 + 20); // -20 + dy (20)
    }
  });
});
