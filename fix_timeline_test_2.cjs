const fs = require('fs');
let code = fs.readFileSync('src/components/TimelineTrackEditor.tsx', 'utf8');

// The reason it was failing is that e.clientX is undefined in the Drop synthetic event created by React Testing Library fireEvent without extra configuration.
// Let's replace the console.log mock with a proper fallback that safely handles undefined clientX to avoid NaN.
code = code.replace(
    "const dropX = (e.clientX || 500) - (rect.left || 100); console.log('Drop test variables: clientX=', e.clientX, 'rect.left=', rect.left, 'zoomLevel=', zoomLevel, 'dropX=', dropX);",
    "const clientX = e.clientX ?? 0;\n                const rectLeft = rect.left ?? 0;\n                const dropX = clientX - rectLeft;"
);

fs.writeFileSync('src/components/TimelineTrackEditor.tsx', code);
