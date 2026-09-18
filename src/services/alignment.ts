import { WordTimestamp } from './whisperTranscriber';
import { TimelineStore } from '../store/timelineStore';
import { secondsToRational } from '../types/time';

/**
 * Calculates continuous segments of words to delete, and applies ripple deletes
 * in reverse temporal order so that deleting later ranges does not affect the
 * start times of earlier ranges.
 */
export function deleteWordsFromTimeline(
  timelineStore: Pick<TimelineStore, 'rippleDelete'>,
  selectedWords: WordTimestamp[],
  allWords: WordTimestamp[]
): WordTimestamp[] {
  if (selectedWords.length === 0) return allWords;

  // Sort words by start time
  const sortedWords = [...selectedWords].sort((a, b) => a.startTime - b.startTime);

  // Group into contiguous blocks to minimize ripple delete commands
  const blocks: { start: number; end: number }[] = [];
  let currentBlock = { start: sortedWords[0].startTime, end: sortedWords[0].endTime };

  for (let i = 1; i < sortedWords.length; i++) {
    const word = sortedWords[i];
    // If words are contiguous (or overlapping), merge them into the current block.
    // Using a tiny epsilon (0.01) to account for floating point inaccuracies if needed,
    // but in whispered timestamps they might have slight gaps.
    // Actually, forced alignment says "exactly that word's audio range".
    // We should probably just delete each word's exact range if they have gaps,
    // but practically words in a sentence might have 0.05s gaps.
    // For exactness required by the prompt, we'll only merge if they strictly touch or overlap,
    // or we just issue a delete for every exact word boundary if we want "exactly that word's audio range".
    // Let's just group them if the gap is very small (e.g., < 0.001) or overlap.
    if (word.startTime <= currentBlock.end + 0.001) {
      currentBlock.end = Math.max(currentBlock.end, word.endTime);
    } else {
      blocks.push(currentBlock);
      currentBlock = { start: word.startTime, end: word.endTime };
    }
  }
  blocks.push(currentBlock);

  // Reverse the blocks so we delete from the end of the timeline first
  blocks.reverse();

  // Execute ripple delete for each block
  for (const block of blocks) {
    const duration = block.end - block.start;
    if (duration > 0) {
      timelineStore.rippleDelete(
        secondsToRational(block.start),
        secondsToRational(duration)
      );
    }
  }

  // Calculate shifts for the remaining words
  const selectedIds = new Set(selectedWords.map(w => w.id));
  const remainingWords = allWords.filter(w => !selectedIds.has(w.id));

  const updatedWords = remainingWords.map(word => {
    let shift = 0;
    // Calculate total shift caused by blocks before this word
    // (Blocks are sorted in reverse, so iterate from the back of the reversed array, i.e., in chronological order)
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i];
      if (block.end <= word.startTime) {
        shift += (block.end - block.start);
      }
    }

    return {
      ...word,
      startTime: word.startTime - shift,
      endTime: word.endTime - shift
    };
  });

  return updatedWords;
}
