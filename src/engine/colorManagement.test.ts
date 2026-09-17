import { describe, it, expect } from 'vitest';
import { OcioConfig } from './colorManagement';

describe('Color Management (OCIO-subset)', () => {
    it('converting between two defined spaces and back returns the original within tolerance', () => {
        const config = new OcioConfig();

        // Test values: typical RGB triplet in sRGB
        const originalRGB: [number, number, number] = [0.5, 0.2, 0.8];

        // Convert sRGB -> ACEScg
        const acesRGB = config.convert(originalRGB, 'sRGB', 'ACEScg');

        // Convert ACEScg -> sRGB
        const convertedBackRGB = config.convert(acesRGB, 'ACEScg', 'sRGB');

        // Check if it returns to the original value within tolerance (1e-4)
        const tolerance = 1e-4;
        expect(Math.abs(originalRGB[0] - convertedBackRGB[0])).toBeLessThan(tolerance);
        expect(Math.abs(originalRGB[1] - convertedBackRGB[1])).toBeLessThan(tolerance);
        expect(Math.abs(originalRGB[2] - convertedBackRGB[2])).toBeLessThan(tolerance);
    });

    it('returns the same value when converting to the same space', () => {
        const config = new OcioConfig();
        const originalRGB: [number, number, number] = [0.1, 0.2, 0.3];
        const result = config.convert(originalRGB, 'sRGB', 'sRGB');
        expect(result).toEqual(originalRGB);
    });

    it('throws error when setting or getting unknown spaces', () => {
        const config = new OcioConfig();
        expect(() => config.setWorkingSpace('Unknown')).toThrowError('Color space Unknown not found');
        expect(() => config.setDisplaySpace('Unknown')).toThrowError('Color space Unknown not found');
        expect(() => config.getSpace('Unknown')).toThrowError('Color space Unknown not found');
    });

    it('sets and gets working and display spaces correctly', () => {
        const config = new OcioConfig();
        config.setWorkingSpace('ACEScg');
        config.setDisplaySpace('sRGB');

        expect(config.getWorkingSpace()).toBe('ACEScg');
        expect(config.getDisplaySpace()).toBe('sRGB');
    });
});
