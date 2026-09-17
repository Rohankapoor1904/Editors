/**
 * Partial OpenColorIO-style configuration and transformations.
 * This is a partial subset as per R4.3 acceptance criteria.
 */

export interface ColorSpace {
    name: string;
    family: string;
    toReference: (rgb: [number, number, number]) => [number, number, number];
    fromReference: (rgb: [number, number, number]) => [number, number, number];
}

// Matrices from SMPTE RP 431-2, ACES standard, and sRGB spec.

function multiplyMatrix(m: number[], v: [number, number, number]): [number, number, number] {
    return [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
    ];
}

// Standard sRGB OETF and EOTF
const srgbEotf = (v: number) => {
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const srgbOetf = (v: number) => {
    return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
};

// Assuming the reference space is linear sRGB (Linear Rec.709) for simplicity of this subset.

export const sRGBSpace: ColorSpace = {
    name: 'sRGB',
    family: 'Display',
    toReference: (rgb: [number, number, number]) => {
        return [srgbEotf(rgb[0]), srgbEotf(rgb[1]), srgbEotf(rgb[2])];
    },
    fromReference: (rgb: [number, number, number]) => {
        return [srgbOetf(rgb[0]), srgbOetf(rgb[1]), srgbOetf(rgb[2])];
    }
};

// ACEScg to Linear sRGB conversion matrix
// https://github.com/ampas/aces-dev/blob/master/transforms/ctl/acescg/ACEScsc.ACEScg_to_ACES.ctl
// It is simpler to use the direct conversion matrix between sRGB linear and ACEScg.
// ACEScg to sRGB linear:
const ACEScg_to_sRGB = [
    1.70505295, -0.62186715, -0.0831858,
    -0.13025595, 1.14080184, -0.0105459,
    -0.02400713, -0.1289657, 1.15297284
];

// sRGB linear to ACEScg:
const sRGB_to_ACEScg = [
    0.6130974, 0.339523, 0.0473796,
    0.070194, 0.9163539, 0.0134521,
    0.020619, 0.1095697, 0.8698113
];

export const ACEScgSpace: ColorSpace = {
    name: 'ACEScg',
    family: 'ACES',
    // Reference is linear sRGB, so from ACEScg to Reference:
    toReference: (rgb: [number, number, number]) => {
        return multiplyMatrix(ACEScg_to_sRGB, rgb);
    },
    // Reference to ACEScg:
    fromReference: (rgb: [number, number, number]) => {
        return multiplyMatrix(sRGB_to_ACEScg, rgb);
    }
};

export class OcioConfig {
    private spaces: Map<string, ColorSpace> = new Map();
    private workingSpaceName: string = '';
    private displaySpaceName: string = '';

    constructor() {
        this.registerSpace(sRGBSpace);
        this.registerSpace(ACEScgSpace);
    }

    public registerSpace(space: ColorSpace) {
        this.spaces.set(space.name, space);
    }

    public getSpace(name: string): ColorSpace {
        const space = this.spaces.get(name);
        if (!space) {
            throw new Error(`Color space ${name} not found`);
        }
        return space;
    }

    public setWorkingSpace(name: string) {
        if (!this.spaces.has(name)) {
            throw new Error(`Color space ${name} not found`);
        }
        this.workingSpaceName = name;
    }

    public setDisplaySpace(name: string) {
        if (!this.spaces.has(name)) {
            throw new Error(`Color space ${name} not found`);
        }
        this.displaySpaceName = name;
    }

    public getWorkingSpace(): string {
        return this.workingSpaceName;
    }

    public getDisplaySpace(): string {
        return this.displaySpaceName;
    }

    public convert(rgb: [number, number, number], fromSpace: string, toSpace: string): [number, number, number] {
        const from = this.getSpace(fromSpace);
        const to = this.getSpace(toSpace);

        if (fromSpace === toSpace) return rgb;

        // Convert to reference (Linear sRGB)
        const reference = from.toReference(rgb);

        // Convert from reference to target space
        return to.fromReference(reference);
    }
}
