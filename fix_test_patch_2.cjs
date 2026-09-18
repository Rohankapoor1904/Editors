const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/AssetBin.test.tsx', 'utf8');

code = code.replace(
    "this.onloadmetadata?.();",
    "// @ts-ignore\n          this.onloadmetadata?.();"
);

fs.writeFileSync('src/components/__tests__/AssetBin.test.tsx', code);
