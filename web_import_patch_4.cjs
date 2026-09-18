const fs = require('fs');
let code = fs.readFileSync('src/components/AssetBin.tsx', 'utf8');

// There are probably 3 matching strings, let's remove ALL but the first.
const regex = /<input\s+type="file"\s+data-testid="hidden-file-input"[\s\S]*?\/>/g;
const match = code.match(regex);
if (match && match.length > 1) {
    const firstMatch = match[0];
    let newCode = code.replaceAll(firstMatch, '');
    newCode = newCode.replace('{/* Top Header */}', firstMatch + '\n      {/* Top Header */}');
    fs.writeFileSync('src/components/AssetBin.tsx', newCode);
}
