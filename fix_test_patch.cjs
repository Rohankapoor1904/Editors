const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/AssetBin.test.tsx', 'utf8');

code = code.replace(
    "const addButtons = screen.getAllByRole('button');",
    "const buttons = screen.getAllByRole('button');\n    const addButtons = buttons.filter(b => b.className.includes('bg-dark-950/90 hover:bg-indigo-900') || b.className.includes('bg-dark-800 hover:bg-indigo-900'));"
);

code = code.replace(
    "const plusButtons = addButtons.filter(b => b.textContent === '');\n    if (plusButtons.length > 0) {\n      fireEvent.click(plusButtons[0]);\n    }",
    "if (addButtons.length > 0) {\n      fireEvent.click(addButtons[0]);\n    }"
);

fs.writeFileSync('src/components/__tests__/AssetBin.test.tsx', code);
