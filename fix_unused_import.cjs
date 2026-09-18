const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/TimelineTrackEditor.test.tsx', 'utf8');
code = code.replace("import { render, screen, fireEvent } from '@testing-library/react';", "import { render, fireEvent } from '@testing-library/react';");
fs.writeFileSync('src/components/__tests__/TimelineTrackEditor.test.tsx', code);
