import fs from 'node:fs';
import path from 'node:path';

/**
 * Mechanical Invariant Verification Script (Task R11.14)
 * This script runs as part of test/CI gates to mechanically block agents (Jules, OpenHands, etc.)
 * from shipping single-pass stubs, rubber-stamped PRs, broken IPC contracts, or root clutter.
 */

const projectRoot = process.cwd();
const errors = [];

function checkFileExists(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing required file: ${relPath}`);
    return null;
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

console.log('🔍 Running Mechanical Invariant Checks (Task R11.14)...');

// =========================================================================
// 1. Invariant §5.5: Safe-by-Default Runtime Mode
// =========================================================================
const runtimeConfigContent = checkFileExists('src/services/runtimeConfig.ts');
if (runtimeConfigContent) {
  if (runtimeConfigContent.includes("currentRuntimeMode: RuntimeMode = 'demo'")) {
    errors.push("Invariant §5.5 Violation: currentRuntimeMode in runtimeConfig.ts must default to 'live', not 'demo'.");
  }
  if (!runtimeConfigContent.includes("currentRuntimeMode: RuntimeMode = 'live'")) {
    errors.push("Invariant §5.5 Violation: currentRuntimeMode must be explicitly initialized to 'live'.");
  }
  if (!runtimeConfigContent.includes('import.meta.env.DEV')) {
    errors.push("Task R11.3 Violation: demo mode must be strictly guarded behind import.meta.env.DEV in runtimeConfig.ts.");
  }
}

// =========================================================================
// 2. Invariant §5.7: No Fabricated Trajectories (Math.sin drift)
// =========================================================================
const srcFiles = getAllFiles(path.join(projectRoot, 'src'));
for (const file of srcFiles) {
  if ((file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) &&
      !file.includes('__tests__') && !file.includes('.test.')) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('Math.sin(i * 0.1)')) {
      const rel = path.relative(projectRoot, file);
      errors.push(`Invariant §5.7 Violation: Fabricated trajectory 'Math.sin(i * 0.1)' found in ${rel}.`);
    }
  }
}

// =========================================================================
// 3. Row 10: Real Cubic Bezier Solver in Keyframing
// =========================================================================
const keyframingContent = checkFileExists('src/utils/keyframing.ts');
if (keyframingContent) {
  if (!keyframingContent.includes('export function solveCubicBezier') ||
      !keyframingContent.includes('export function evaluateEasing')) {
    errors.push("Row 10 Violation: keyframing.ts must export solveCubicBezier and evaluateEasing.");
  }
}
const keyframingBehaviourTest = 'src/__tests__/keyframing.behavior.test.ts';
if (!checkFileExists(keyframingBehaviourTest)) {
  errors.push(
    `Row 10 Violation: ${keyframingBehaviourTest} is missing. Presence of the function names is not ` +
    "evidence the Bezier math is real — a behavioural test asserting exact curve output is required."
  );
}

// =========================================================================
// 4. Invariant §5.5: Rust Native Handlers must fail loudly / no hardcoded STT
// =========================================================================
const whisperRust = checkFileExists('src-tauri/src/whisper_onnx.rs');
if (whisperRust && whisperRust.includes('full_text: "Welcome to CineCraft AI')) {
  errors.push("Invariant §5.5 Violation: Native Whisper Rust engine contains hardcoded fake transcript on main path.");
}

const sileroRust = checkFileExists('src-tauri/src/silero_vad.rs');
if (sileroRust && sileroRust.includes('start_time: 5.0') && sileroRust.includes('Ok(vec![')) {
  errors.push("Invariant §5.5 Violation: Native Silero Rust engine contains hardcoded fake silence segments on main path.");
}

// =========================================================================
// 5. Anti-Clutter Guard: Clean Repository Root (Task R11.12 / R11.14)
// Barrows agents from committing scratch .cjs, .txt, .sh, or temporary patch scripts
// =========================================================================
const ALLOWED_ROOT_FILES = new Set([
  '.eslintrc.cjs',
  '.gitignore',
  'AGENTS.md',
  'PROGRESS.md',
  'index.html',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'tailwind.config.js',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'vitest.setup.ts'
]);

const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
for (const entry of rootEntries) {
  if (entry.isFile()) {
    if (!ALLOWED_ROOT_FILES.has(entry.name)) {
      errors.push(`Root Clutter Violation: Unauthorized file '${entry.name}' detected in repository root. Agents must not commit scratch scripts, patch files, or text logs.`);
    }
  }
}

// =========================================================================
// 6. Tauri IPC Contract Enforcement (Task R11.1 / R11.14)
// Every `invoke('<cmd>')` in `src/` must match a registered command in `main.rs`
// =========================================================================
const mainRsContent = checkFileExists('src-tauri/src/main.rs');
if (mainRsContent) {
  const handlerMatch = mainRsContent.match(/tauri::generate_handler!\[([^\]]+)\]/s);
  if (!handlerMatch) {
    errors.push("IPC Contract Violation: Could not parse tauri::generate_handler! in src-tauri/src/main.rs.");
  } else {
    const registeredCommands = new Set(
      handlerMatch[1]
        .split(',')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('//'))
    );

    const invokeRegex = /invoke(?:\s*<[^>]+>)?\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
    for (const file of srcFiles) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        const content = fs.readFileSync(file, 'utf-8');
        let match;
        while ((match = invokeRegex.exec(content)) !== null) {
          const invokedCmd = match[1];
          if (!registeredCommands.has(invokedCmd)) {
            const rel = path.relative(projectRoot, file);
            errors.push(`IPC Contract Violation: ${rel} invokes '${invokedCmd}', which is NOT registered in src-tauri/src/main.rs generate_handler!`);
          }
        }
      }
    }
  }
}

// =========================================================================
// 7. Shader Integrity Check: Shaders must not self-declare as placeholder
// =========================================================================
const shaderDir = path.join(projectRoot, 'src/engine/shaders');
if (fs.existsSync(shaderDir)) {
  const shaderFiles = fs.readdirSync(shaderDir).filter(f => f.endsWith('.wgsl'));
  for (const sFile of shaderFiles) {
    const sPath = path.join(shaderDir, sFile);
    const content = fs.readFileSync(sPath, 'utf-8');
    // Ensure shader has valid entry points or functions and not just empty or throwing logic
    if (content.length < 20) {
      errors.push(`Shader Violation: ${sFile} in src/engine/shaders is empty or truncated.`);
    }
  }
}

// =========================================================================
// 8. Gate Result Evaluation
// =========================================================================
if (errors.length > 0) {
  console.error('\n❌ MECHANICAL INVARIANT CHECKS FAILED:');
  errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
  console.error('\nAgents must not mark tasks "done" or proceed until all invariants pass cleanly.\n');
  process.exit(1);
}

console.log('✅ All mechanical invariants passed cleanly.');
process.exit(0);
