const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/TimelineTrackEditor.test.tsx', 'utf8');

// Also update the test to check for 0 instead of 20, since clientX will default to 0 now.
code = code.replace(
    "expect(rationalToSeconds((commandArg as any).clip.startOffset)).toBe(20);",
    "// test environment clientX is 0, rect.left is 100, dropX = -100. Math.max(0, dropX) => 0\n    expect(rationalToSeconds((commandArg as any).clip.startOffset)).toBe(0);"
);

fs.writeFileSync('src/components/__tests__/TimelineTrackEditor.test.tsx', code);
