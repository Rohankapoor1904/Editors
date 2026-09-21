import { CaptionWord } from './captionEngine';
import { Clip } from '../../types/timeline';
import { rationalToSeconds } from '../../types/time';

export const DEFAULT_HINDI_POEM_WORDS: CaptionWord[] = [
  // 0s - 3.8s
  { id: 'w_01', word: 'MERE', startTime: 0.0, endTime: 0.5 },
  { id: 'w_02', word: 'GUNAAHON', startTime: 0.5, endTime: 1.2 },
  { id: 'w_03', word: 'KO', startTime: 1.2, endTime: 1.5 },
  { id: 'w_04', word: 'DEKHOGE', startTime: 1.5, endTime: 2.2 },
  { id: 'w_05', word: 'TO', startTime: 2.2, endTime: 2.5 },
  { id: 'w_06', word: 'AFSAANAH', startTime: 2.5, endTime: 3.2 },
  { id: 'w_07', word: 'HOGA', startTime: 3.2, endTime: 3.8 },

  // 3.8s - 8.2s
  { id: 'w_08', word: 'AUR', startTime: 3.8, endTime: 4.2 },
  { id: 'w_09', word: 'MERE', startTime: 4.2, endTime: 4.8 },
  { id: 'w_10', word: 'IRAADO', startTime: 4.8, endTime: 5.6 },
  { id: 'w_11', word: 'KO', startTime: 5.6, endTime: 5.9 },
  { id: 'w_12', word: 'JAANOGE', startTime: 5.9, endTime: 6.7 },
  { id: 'w_13', word: 'TO', startTime: 6.7, endTime: 7.1 },
  { id: 'w_14', word: 'HAUSLA', startTime: 7.1, endTime: 7.7 },
  { id: 'w_15', word: 'HOGA', startTime: 7.7, endTime: 8.2 },

  // 8.2s - 13.3s
  { id: 'w_16', word: 'MAIN', startTime: 8.2, endTime: 8.6 },
  { id: 'w_17', word: 'AAPSE', startTime: 8.6, endTime: 9.1 },
  { id: 'w_18', word: 'YE', startTime: 9.1, endTime: 9.4 },
  { id: 'w_19', word: 'KEHNE', startTime: 9.4, endTime: 9.9 },
  { id: 'w_20', word: 'AAYA', startTime: 9.9, endTime: 10.4 },
  { id: 'w_21', word: 'HOON', startTime: 10.4, endTime: 10.8 },
  { id: 'w_22', word: 'KE', startTime: 10.8, endTime: 11.1 },
  { id: 'w_23', word: 'HISAB', startTime: 11.1, endTime: 11.7 },
  { id: 'w_24', word: 'KA', startTime: 11.7, endTime: 12.0 },
  { id: 'w_25', word: 'DIN', startTime: 12.0, endTime: 12.4 },
  { id: 'w_26', word: 'AA', startTime: 12.4, endTime: 12.7 },
  { id: 'w_27', word: 'GAYA', startTime: 12.7, endTime: 13.0 },
  { id: 'w_28', word: 'HAI', startTime: 13.0, endTime: 13.3 },

  // 13.3s - 18.8s
  { id: 'w_29', word: 'KHUDA', startTime: 13.4, endTime: 13.9 },
  { id: 'w_30', word: 'KA', startTime: 13.9, endTime: 14.2 },
  { id: 'w_31', word: 'TO', startTime: 14.2, endTime: 14.5 },
  { id: 'w_32', word: 'MAALUM', startTime: 14.5, endTime: 15.1 },
  { id: 'w_33', word: 'NAHI', startTime: 15.1, endTime: 15.5 },
  { id: 'w_34', word: 'PAR', startTime: 15.5, endTime: 15.9 },
  { id: 'w_35', word: 'AADMI', startTime: 15.9, endTime: 16.5 },
  { id: 'w_36', word: 'JAANEGA', startTime: 16.5, endTime: 17.2 },
  { id: 'w_37', word: 'KI', startTime: 17.2, endTime: 17.5 },
  { id: 'w_38', word: 'KYA', startTime: 17.5, endTime: 17.9 },
  { id: 'w_39', word: 'MAAMLA', startTime: 17.9, endTime: 18.4 },
  { id: 'w_40', word: 'HOGA', startTime: 18.4, endTime: 18.8 },

  // 18.8s - 23.5s
  { id: 'w_41', word: 'YE', startTime: 18.9, endTime: 19.3 },
  { id: 'w_42', word: 'BABA', startTime: 19.3, endTime: 19.8 },
  { id: 'w_43', word: 'AADAM', startTime: 19.8, endTime: 20.4 },
  { id: 'w_44', word: 'KE', startTime: 20.4, endTime: 20.7 },
  { id: 'w_45', word: 'ZAMAANE', startTime: 20.7, endTime: 21.4 },
  { id: 'w_46', word: 'KI', startTime: 21.4, endTime: 21.7 },
  { id: 'w_47', word: 'LADAI', startTime: 21.7, endTime: 22.5 },
  { id: 'w_48', word: 'HAI', startTime: 22.5, endTime: 23.2 },

  // 23.5s - 29.5s
  { id: 'w_49', word: 'AUR', startTime: 23.5, endTime: 24.0 },
  { id: 'w_50', word: 'MERE', startTime: 24.0, endTime: 24.5 },
  { id: 'w_51', word: 'LOGO', startTime: 24.5, endTime: 25.1 },
  { id: 'w_52', word: 'NIKAL', startTime: 25.1, endTime: 25.7 },
  { id: 'w_53', word: 'AAO', startTime: 25.7, endTime: 26.3 },
  { id: 'w_54', word: 'GHARON', startTime: 26.3, endTime: 27.0 },
  { id: 'w_55', word: 'SE', startTime: 27.0, endTime: 27.4 },
  { id: 'w_56', word: 'MAIDAAN', startTime: 27.4, endTime: 28.3 },
  { id: 'w_57', word: 'KE', startTime: 28.3, endTime: 28.7 },
  { id: 'w_58', word: 'LIYE', startTime: 28.7, endTime: 29.3 },

  // 29.5s - 36.5s
  { id: 'w_59', word: 'WAH', startTime: 29.6, endTime: 30.1 },
  { id: 'w_60', word: 'REHBAR', startTime: 30.1, endTime: 30.8 },
  { id: 'w_61', word: 'HOGA', startTime: 30.8, endTime: 31.4 },
  { id: 'w_62', word: 'WAH', startTime: 31.5, endTime: 32.0 },
  { id: 'w_63', word: 'REHNUMA', startTime: 32.0, endTime: 32.8 },
  { id: 'w_64', word: 'HOGA', startTime: 32.8, endTime: 33.4 },
  { id: 'w_65', word: 'JO', startTime: 33.5, endTime: 34.0 },
  { id: 'w_66', word: 'SACH', startTime: 34.0, endTime: 34.7 },
  { id: 'w_67', word: 'KE', startTime: 34.7, endTime: 35.1 },
  { id: 'w_68', word: 'SATH', startTime: 35.1, endTime: 35.8 },
  { id: 'w_69', word: 'HOGA', startTime: 35.8, endTime: 36.4 },

  // 36.5s - 42.5s
  { id: 'w_70', word: 'AUR', startTime: 36.6, endTime: 37.1 },
  { id: 'w_71', word: 'MUJHE', startTime: 37.1, endTime: 37.7 },
  { id: 'w_72', word: 'MASIHA', startTime: 37.7, endTime: 38.5 },
  { id: 'w_73', word: 'PAR', startTime: 38.5, endTime: 38.9 },
  { id: 'w_74', word: 'KOI', startTime: 38.9, endTime: 39.4 },
  { id: 'w_75', word: 'YAQEEN', startTime: 39.4, endTime: 40.2 },
  { id: 'w_76', word: 'NAHI', startTime: 40.2, endTime: 40.8 },
  { id: 'w_77', word: 'HAI', startTime: 40.8, endTime: 41.5 },

  // 42.5s - 46.87s
  { id: 'w_78', word: 'JO', startTime: 42.5, endTime: 43.0 },
  { id: 'w_79', word: 'APNE', startTime: 43.0, endTime: 43.6 },
  { id: 'w_80', word: 'HAQ', startTime: 43.6, endTime: 44.2 },
  { id: 'w_81', word: 'KE', startTime: 44.2, endTime: 44.5 },
  { id: 'w_82', word: 'LIYE', startTime: 44.5, endTime: 45.0 },
  { id: 'w_83', word: 'LADE', startTime: 45.0, endTime: 45.6 },
  { id: 'w_84', word: 'WOHI', startTime: 45.6, endTime: 46.2 },
  { id: 'w_85', word: 'KHUDA', startTime: 46.2, endTime: 46.6 },
  { id: 'w_86', word: 'HOGA', startTime: 46.6, endTime: 46.87 },
];

export function getCaptionWordsForClip(clip: Clip): CaptionWord[] {
  const durationSec = rationalToSeconds(clip.duration);
  const startSec = rationalToSeconds(clip.startOffset);

  if (durationSec >= 30) {
    return DEFAULT_HINDI_POEM_WORDS.map((w) => ({
      ...w,
      startTime: startSec + w.startTime,
      endTime: startSec + Math.min(w.endTime, durationSec),
    })).filter((w) => w.startTime < startSec + durationSec);
  }

  const sampleTokens = ['CINECRAFT', 'AI', 'DYNAMIC', 'KINETIC', 'CAPTIONS', 'HIGH', 'ENERGY', 'VIRAL', 'HIGHLIGHT'];
  const tokenDuration = Math.max(0.4, durationSec / sampleTokens.length);
  return sampleTokens.map((word, i) => ({
    id: `tok_${clip.id}_${i}`,
    word,
    startTime: startSec + i * tokenDuration,
    endTime: startSec + (i + 1) * tokenDuration,
  }));
}
