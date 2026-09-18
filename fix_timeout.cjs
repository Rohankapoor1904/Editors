const fs = require('fs');
let code = fs.readFileSync('src/components/__tests__/AssetBin.test.tsx', 'utf8');

code = code.replace(
    "setTimeout(() => {\n          // @ts-expect-error test mock\n          this.onloadmetadata?.();\n          // We need a proper event target mock or just bypass the load entirely\n        }, 0);",
    "Promise.resolve().then(() => {\n          // @ts-expect-error test mock\n          this.onloadmetadata?.();\n        });"
);

code = code.replace(
    "setTimeout(cb, 10);",
    "Promise.resolve().then(cb);"
);

fs.writeFileSync('src/components/__tests__/AssetBin.test.tsx', code);
