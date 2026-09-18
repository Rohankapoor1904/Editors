const fs = require('fs');

let audioEngine = fs.readFileSync('src/engine/audioEngine.ts', 'utf8');

// Undo the getOrCreateClipGain replacement mistake
audioEngine = audioEngine.replace('getOrCreateClipGain(_clipId: string): GainNode | null {', 'getOrCreateClipGain(clipId: string): GainNode | null {');

// The unused variable warning was `clipId` on line 206
// Let's see what is on line 206
const lines = audioEngine.split('\n');
console.log("Lines 200-215:");
for (let i = 195; i < 215; i++) {
  if (lines[i] !== undefined) console.log(`${i+1}: ${lines[i]}`);
}
