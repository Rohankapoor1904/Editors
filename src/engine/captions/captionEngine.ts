import captionWgsl from '../shaders/caption.wgsl?raw';

export interface CaptionWord {
  id: string;
  word: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
}

export interface CaptionTrackData {
  words: CaptionWord[];
}

export type CaptionPreset = 'hormozi' | 'karaoke' | 'neon' | 'minimal';

export interface CaptionStyleConfig {
  preset: CaptionPreset;
  fontFamily: string;
  fontSize: number; // in pixels relative to 1080p
  activeColor: string;
  inactiveColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  shadowBlur?: number;
  shadowColor?: string;
  uppercase?: boolean;
  bounceScale?: number;
  positionY?: number; // 0.0 to 1.0 (default 0.82)
  maxWordsPerLine?: number;
}

export const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyleConfig> = {
  hormozi: {
    preset: 'hormozi',
    fontFamily: '"Montserrat", "Impact", "Arial Black", sans-serif',
    fontSize: 54,
    activeColor: '#fde047', // Bold Viral Yellow
    inactiveColor: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 8,
    shadowBlur: 12,
    shadowColor: 'rgba(0, 0, 0, 0.9)',
    uppercase: true,
    bounceScale: 0.20, // 20% pop bounce
    positionY: 0.80,
    maxWordsPerLine: 5
  },
  karaoke: {
    preset: 'karaoke',
    fontFamily: '"Inter", "Helvetica Neue", sans-serif',
    fontSize: 48,
    activeColor: '#38bdf8', // Neon Sky Blue
    inactiveColor: '#94a3b8',
    strokeColor: '#0f172a',
    strokeWidth: 6,
    shadowBlur: 16,
    shadowColor: 'rgba(56, 189, 248, 0.6)',
    uppercase: false,
    bounceScale: 0.12,
    positionY: 0.82,
    maxWordsPerLine: 6
  },
  neon: {
    preset: 'neon',
    fontFamily: '"Outfit", "Futura", sans-serif',
    fontSize: 50,
    activeColor: '#f43f5e', // Hot Pink Neon
    inactiveColor: '#f8fafc',
    strokeColor: '#881337',
    strokeWidth: 7,
    shadowBlur: 20,
    shadowColor: 'rgba(244, 63, 94, 0.8)',
    uppercase: true,
    bounceScale: 0.18,
    positionY: 0.82,
    maxWordsPerLine: 4
  },
  minimal: {
    preset: 'minimal',
    fontFamily: '"Inter", "Roboto", sans-serif',
    fontSize: 42,
    activeColor: '#fbbf24', // Warm Gold
    inactiveColor: '#e2e8f0',
    strokeColor: '#000000',
    strokeWidth: 4,
    shadowBlur: 8,
    shadowColor: 'rgba(0, 0, 0, 0.8)',
    uppercase: false,
    bounceScale: 0.08,
    positionY: 0.85,
    maxWordsPerLine: 6
  }
};

export class CaptionEngine {
  getWGSLShaderCode(): string {
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

  /**
   * Groups words into sequential readable phrases of up to `maxWords` or natural sentence pauses (> 0.6s gap).
   * Returns the phrase containing the active word or timecode.
   */
  getPhraseForTimecode(
    words: CaptionWord[],
    timecode: number,
    maxWords = 5
  ): { phraseWords: CaptionWord[]; activeIndexInPhrase: number; progress: number } | null {
    if (!words || words.length === 0) return null;

    // Split words into phrases
    const phrases: CaptionWord[][] = [];
    let currentPhrase: CaptionWord[] = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (currentPhrase.length > 0) {
        const prev = currentPhrase[currentPhrase.length - 1];
        const gap = w.startTime - prev.endTime;
        if (currentPhrase.length >= maxWords || gap > 0.6) {
          phrases.push(currentPhrase);
          currentPhrase = [];
        }
      }
      currentPhrase.push(w);
    }
    if (currentPhrase.length > 0) {
      phrases.push(currentPhrase);
    }

    // Find the phrase that covers the given timecode
    for (const phrase of phrases) {
      const phraseStart = phrase[0].startTime;
      const phraseEnd = phrase[phrase.length - 1].endTime + 0.3; // brief hold after phrase ends

      if (timecode >= phraseStart && timecode <= phraseEnd) {
        let activeIdx = -1;
        let progress = 0;

        for (let j = 0; j < phrase.length; j++) {
          if (timecode >= phrase[j].startTime && timecode <= phrase[j].endTime) {
            activeIdx = j;
            const dur = Math.max(0.01, phrase[j].endTime - phrase[j].startTime);
            progress = Math.min(1.0, Math.max(0.0, (timecode - phrase[j].startTime) / dur));
            break;
          }
        }

        return {
          phraseWords: phrase,
          activeIndexInPhrase: activeIdx,
          progress
        };
      }
    }

    return null;
  }

  /**
   * Renders dynamic kinetic captions to a 2D canvas context with per-word bounce and highlight animation.
   */
  renderKineticCaptionsToCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    words: CaptionWord[],
    timecode: number,
    customConfig?: Partial<CaptionStyleConfig>
  ): void {
    const config: CaptionStyleConfig = {
      ...CAPTION_PRESETS[customConfig?.preset || 'hormozi'],
      ...customConfig
    };

    const phraseInfo = this.getPhraseForTimecode(words, timecode, config.maxWordsPerLine);
    if (!phraseInfo) return;

    const { phraseWords, activeIndexInPhrase, progress } = phraseInfo;

    ctx.save();

    // Scale font size proportionally to canvas height relative to reference 1080p
    const scaleFactor = height / 1080;
    const computedFontSize = Math.max(16, Math.round(config.fontSize * scaleFactor));
    const computedStrokeWidth = config.strokeWidth ? Math.round(config.strokeWidth * scaleFactor) : 0;
    const computedShadowBlur = config.shadowBlur ? Math.round(config.shadowBlur * scaleFactor) : 0;

    ctx.font = `900 ${computedFontSize}px ${config.fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    // Measure each word width + space
    const spaceWidth = ctx.measureText(' ').width;
    const wordWidths = phraseWords.map((w) => {
      const text = config.uppercase ? w.word.toUpperCase() : w.word;
      return ctx.measureText(text).width;
    });

    const totalPhraseWidth = wordWidths.reduce((acc, w) => acc + w, 0) + (phraseWords.length - 1) * spaceWidth;
    const startX = (width - totalPhraseWidth) / 2;
    const centerY = height * (config.positionY ?? 0.82);

    let currentX = startX;

    for (let i = 0; i < phraseWords.length; i++) {
      const w = phraseWords[i];
      const text = config.uppercase ? w.word.toUpperCase() : w.word;
      const wordWidth = wordWidths[i];
      const isActive = i === activeIndexInPhrase;

      ctx.save();

      // Kinetic scale bounce for active word
      if (isActive && config.bounceScale) {
        // Sine curve bounce: peaks at midpoint (sin(π * progress))
        const bounce = 1.0 + config.bounceScale * Math.sin(Math.PI * progress);
        const wordCenterX = currentX + wordWidth / 2;

        ctx.translate(wordCenterX, centerY);
        ctx.scale(bounce, bounce);
        ctx.translate(-wordCenterX, -centerY);
      }

      // Drop Shadow
      if (config.shadowColor && computedShadowBlur > 0) {
        ctx.shadowColor = config.shadowColor;
        ctx.shadowBlur = isActive ? computedShadowBlur * 1.5 : computedShadowBlur;
        ctx.shadowOffsetX = 2 * scaleFactor;
        ctx.shadowOffsetY = 3 * scaleFactor;
      }

      // Stroke outline
      if (computedStrokeWidth > 0 && config.strokeColor) {
        ctx.strokeStyle = config.strokeColor;
        ctx.lineWidth = computedStrokeWidth;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(text, currentX, centerY);
      }

      // Fill color
      ctx.fillStyle = isActive ? config.activeColor : config.inactiveColor;
      ctx.fillText(text, currentX, centerY);

      ctx.restore();

      currentX += wordWidth + spaceWidth;
    }

    ctx.restore();
  }
}

export const captionEngine = new CaptionEngine();
