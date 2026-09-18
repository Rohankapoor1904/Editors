const fs = require('fs');

let content = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

// There shouldn't be any lint errors, the terminal just finished outputting cleanly.
// Let me verify everything is committed correctly.
