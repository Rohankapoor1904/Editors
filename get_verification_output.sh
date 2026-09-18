#!/bin/bash
echo "## Verification output"
echo "### \`npm run build\`"
echo '```'
npm run build 2>&1
echo '```'
echo ""
echo "### \`npm run test\`"
echo '```'
npm run test 2>&1
echo '```'
echo ""
echo "### \`npm run lint\`"
echo '```'
npm run lint 2>&1
echo '```'
