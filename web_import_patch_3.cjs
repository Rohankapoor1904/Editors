const fs = require('fs');
let code = fs.readFileSync('src/components/AssetBin.tsx', 'utf8');

// There are multiple inputs because we might have accidentally added it multiple times or it matches multiple.
// Let's just remove the duplicate if it exists.
let matches = code.match(/<input\s+type="file"\s+data-testid="hidden-file-input"[\s\S]*?\/>/g);

if (matches && matches.length > 1) {
  // Remove the second one
  code = code.replace(matches[1], '');
  fs.writeFileSync('src/components/AssetBin.tsx', code);
}
