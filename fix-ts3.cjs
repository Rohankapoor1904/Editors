const fs = require('fs');

let audioEngine = fs.readFileSync('src/engine/audioEngine.ts', 'utf8');

// The original unused variable was on line 206!
// Oh wait, my stopAllClips method that I injected.
// Let's fix that.
let newContent = audioEngine.replace(
  'for (const [clipId, source] of this.activeSources.entries()) {',
  'for (const [, source] of this.activeSources.entries()) {'
);

fs.writeFileSync('src/engine/audioEngine.ts', newContent);
