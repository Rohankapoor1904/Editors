import { isLiveMode, NotImplementedError } from '../../services/runtimeConfig';
import captionWgsl from '../shaders/caption.wgsl?raw';

export interface CaptionWord {
    id: string;
    word: string;
    startTime: number;
    endTime: number;
}

export interface CaptionTrackData {
    words: CaptionWord[];
}

export class CaptionEngine {
    getWGSLShaderCode(): string {
        if (isLiveMode()) {
            throw new NotImplementedError('Real Text Layout / Caption Engine WGSL');
        }
        return captionWgsl;
    }

    /**
     * Finds the index of the active word at a given timecode.
     * Returns -1 if no word is active.
     */
    getActiveWordIndex(words: CaptionWord[], timecode: number): number {
        for (let i = 0; i < words.length; i++) {
            if (timecode >= words[i].startTime && timecode <= words[i].endTime) {
                return i;
            }
        }
        return -1;
    }
}

export const captionEngine = new CaptionEngine();
