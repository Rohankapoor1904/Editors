const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/AssetBin.test.tsx', 'utf8');

code = code.replace(
    "const fileInput = screen.getByTestId('hidden-file-input') as HTMLInputElement;",
    "const fileInputs = screen.getAllByTestId('hidden-file-input');\n    const fileInput = fileInputs[0] as HTMLInputElement;"
);

fs.writeFileSync('src/components/__tests__/AssetBin.test.tsx', code);
