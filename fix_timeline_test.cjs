const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/TimelineTrackEditor.test.tsx', 'utf8');

// The issue might be that rect.left is undefined if getBoundingClientRect isn't mocked correctly on the target element in JSDOM,
// or clientX is missing from the react testing library drop event causing it to be undefined.
code = code.replace(
    "v2TrackTarget.getBoundingClientRect = vi.fn(() => ({ left: 100, top: 0, right: 1000, bottom: 64, width: 900, height: 64, x: 100, y: 0, toJSON: () => {} }));",
    "// We have to mock getBoundingClientRect on the prototype because testing-library fireEvent creates a synthetic event where currentTarget is evaluated\n    window.HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({\n      left: 100,\n      top: 0,\n      right: 1000,\n      bottom: 64,\n      width: 900,\n      height: 64,\n      x: 100,\n      y: 0,\n      toJSON: () => {}\n    }));"
);

fs.writeFileSync('src/components/__tests__/TimelineTrackEditor.test.tsx', code);
