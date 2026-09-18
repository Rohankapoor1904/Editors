const fs = require('fs');
let code = fs.readFileSync('src/components/TimelineTrackEditor.tsx', 'utf8');

// console.log it out in the component
code = code.replace(
    "const dropX = e.clientX - rect.left;",
    "const dropX = (e.clientX || 500) - (rect.left || 100); console.log('Drop test variables: clientX=', e.clientX, 'rect.left=', rect.left, 'zoomLevel=', zoomLevel, 'dropX=', dropX);"
);

fs.writeFileSync('src/components/TimelineTrackEditor.tsx', code);
