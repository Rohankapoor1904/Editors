const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/AssetBin.test.tsx', 'utf8');

code = code.replace(
    "// @ts-ignore\n          this.onloadmetadata?.();",
    "// @ts-expect-error test mock\n          this.onloadmetadata?.();"
);

fs.writeFileSync('src/components/__tests__/AssetBin.test.tsx', code);
