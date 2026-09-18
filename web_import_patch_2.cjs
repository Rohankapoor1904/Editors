const fs = require('fs');
let code = fs.readFileSync('src/components/AssetBin.tsx', 'utf8');

code = code.replace(
  '<input\n        type="file"\n        ref={fileInputRef}',
  '<input\n        type="file"\n        data-testid="hidden-file-input"\n        ref={fileInputRef}'
);

fs.writeFileSync('src/components/AssetBin.tsx', code);
