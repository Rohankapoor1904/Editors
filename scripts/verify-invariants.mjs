import fs from 'node:fs';
import path from 'node:path';

/**
 * Mechanical Invariant Verification Script
 * This script runs as part of test/CI gates to prevent agents (Jules, OpenHands, etc.)
 * from shipping single-pass stubs, rubber-stamped PRs, or unsafe defaults.
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

console.log('🔍 Running Mechanical Invariant Checks...');

// 1. Invariant §5.5: Safe-by-Default Runtime Mode
const runtimeConfigContent = checkFileExists('src/services/runtimeConfig.ts');
if (runtimeConfigContent) {
  if (runtimeConfigContent.includes("currentRuntimeMode: RuntimeMode = 'demo'")) {
    errors.push("Invariant §5.5 Violation: currentRuntimeMode in runtimeConfig.ts must default to 'live', not 'demo'.");
  }
  if (!runtimeConfigContent.includes("currentRuntimeMode: RuntimeMode = 'live'")) {
    errors.push("Invariant §5.5 Violation: currentRuntimeMode must be explicitly initialized to 'live'.");
  }
}

// 2. Invariant §5.7: No Fabricated Trajectories (Math.sin drift)
const sam2Content = checkFileExists('src/engine/sam2Masking.ts');
if (sam2Content && sam2Content.includes('Math.sin(i * 0.1)')) {
  errors.push("Invariant §5.7 Violation: Fabricated trajectory 'Math.sin(i * 0.1)' found in sam2Masking.ts.");
}

// 3. Row 10: Real Cubic Bezier Solver in Keyframing
//
// The previous check asserted only that the *identifiers* `solveCubicBezier` and
// `evaluateEasing` appear in the file. A body of `return x;` satisfies that while computing
// no curve at all, so the gate could not distinguish a real solver from a linear stub.
// It is verified here by requiring the behavioural suite to exist; the suite itself pins
// exact CSS-Bezier output values, so substituting a stub makes `npm test` fail.
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

// 4. Invariant §5.5: Rust Native Handlers must fail loudly in live mode
const whisperRust = checkFileExists('src-tauri/src/whisper_onnx.rs');
if (whisperRust && whisperRust.includes('full_text: "Welcome to CineCraft AI')) {
  errors.push("Invariant §5.5 Violation: Native Whisper Rust engine contains hardcoded fake transcript on main path.");
}

const sileroRust = checkFileExists('src-tauri/src/silero_vad.rs');
if (sileroRust && sileroRust.includes('start_time: 5.0') && sileroRust.includes('Ok(vec![')) {
  errors.push("Invariant §5.5 Violation: Native Silero Rust engine contains hardcoded fake silence segments on main path.");
}

if (errors.length > 0) {
  console.error('\n❌ MECHANICAL INVARIANT CHECKS FAILED:');
  errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
  console.error('\nAgents must not mark tasks "done" or proceed until all invariants pass cleanly.\n');
  process.exit(1);
}

console.log('✅ All mechanical invariants passed cleanly.');
process.exit(0);
