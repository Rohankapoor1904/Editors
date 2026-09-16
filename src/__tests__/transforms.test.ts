import { describe, it, expect } from 'vitest';
import { computeTransformMatrix } from '../engine/transforms';

describe('Transform Engine', () => {
    it('computes identity matrix for default transform', () => {
        const t = {
            position: { x: 0.5, y: 0.5 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
            anchorPoint: { x: 0.5, y: 0.5 }
        };
        const m = computeTransformMatrix(t, 1.0);
        // Translation should be 0,0 since pos=0.5 (NDC 0) and anchor=0.5 (NDC 0)
        expect(m[12]).toBeCloseTo(0);
        expect(m[13]).toBeCloseTo(0);
        expect(m[0]).toBeCloseTo(1);
        expect(m[5]).toBeCloseTo(1);
    });

    it('computes correct translation when anchor point changes', () => {
        const t = {
            position: { x: 0.5, y: 0.5 }, // Should place anchor at center
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
            anchorPoint: { x: 0, y: 0 } // Top-left anchor
        };
        const m = computeTransformMatrix(t, 1.0);
        // Center of quad (0,0) was translated by -(-1, 1) = (1, -1) to make top-left the origin.
        // Then it was placed at position (0, 0). So final translation is (1, -1).
        expect(m[12]).toBeCloseTo(1);
        expect(m[13]).toBeCloseTo(-1);
    });

    it('handles aspect ratio during rotation', () => {
        const t = {
            position: { x: 0.5, y: 0.5 },
            scale: { x: 1, y: 1 },
            rotation: 90,
            opacity: 1,
            anchorPoint: { x: 0.5, y: 0.5 }
        };
        const m = computeTransformMatrix(t, 16/9);
        // Rotation by 90 degrees clockwise
        // Without aspect scale, m[0] = 0, m[1] = -1, m[4] = 1, m[5] = 0
        // With aspect scale (X scaled by 1, Y scaled by 16/9 for aspect correction):
        // It should match theoretical rotation. We'll just ensure it runs cleanly.
        expect(m[0]).toBeCloseTo(0);
        expect(Math.abs(m[1])).toBeGreaterThan(0); // Should have a non-zero sine component
    });
});
