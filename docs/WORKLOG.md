## 2026-09-19 — Antigravity — R11.14
- **Did:**
  - Strengthened `scripts/verify-invariants.mjs` to mechanically block root scratch files, IPC contract mismatches between Tauri `generate_handler!` and frontend `invoke(...)`, and enforced DEV-only demo mode in `runtimeConfig.ts`.
  - Added behavioural test suite in `src/__tests__/invariants.test.ts`.
  - Hardened `scripts/jules-orchestrator.py` against agent cheating: implemented task scope enforcement (rejects documentation-only PRs for implementation tasks), locked down `PROGRESS.md` so agents cannot self-assign `done`, banned root scratch files in PR diffs, and updated the prompt dispatch template with strict anti-cheat constraints.
  - Added invariant verification step to `.github/workflows/verify.yml`.
- **Verified:**
  - `node scripts/verify-invariants.mjs` -> Passed cleanly (and verified failure on scratch clutter).
  - `npm test` -> 41 test files / 175 tests passed (0 failures).
  - `npm run build` -> Typecheck and Vite production build passed.
  - `npm run lint` -> 0 errors.
  - `py -m py_compile scripts/jules-orchestrator.py` -> Clean compilation.
- **Left undone:** None.
- **Next:** Proceed with R11.4 / R11.6 in the remediation sequence.
- **Blockers:** None.

## 2026-09-19 — Jules — R11.3
- **Did:** Updated `src/services/runtimeConfig.ts` to block 'demo' mode activation in production environments using a dev mode check. Conditionally rendered the LIVE/DEMO toggle button in `src/components/TopBar.tsx` only for dev environments. Verified via mocked tests in `src/__tests__/runtimeMode.test.ts` and `src/components/TopBar.test.tsx`.
- **Verified:** `npm run build`, `npm run test`, and `npm run lint` all passed successfully.
- **Left undone:** N/A.
- **Next:** Proceed with R11.4 to remove the hardcoded demo project on boot.
- **Blockers:** None.

# Session Worklog

---

## 2026-09-19 — agent-jules — R11.2
- **Did:** Unblocked the WebGPU pipeline by removing the `isLiveMode()` check and throw in `captionEngine.ts`, ensuring it always returns the WGSL source. Modified `webgpuRenderer.ts` to throw initialization errors rather than swallowing them. Added a `webgpuError` state to `ProgramMonitor.tsx` and implemented UI conditionally rendering an error overlay and changing the status pill to 'WebGPU Error' when init fails.
- **Verified:** Ran `npm run build`, `npm run test`, and `npm run lint`. All commands passed successfully. Also visually verified using a Playwright script by throwing a mocked error to check the UI.
- **Left undone:** None
- **Next:** Proceed to R11.3
- **Blockers:** None

## $(date +%Y-%m-%d) — agent-Jules — R11.1
- **Did:** Renamed `transcribe_audio` to `run_whisper_stt` in `whisperTranscriber.ts`. Removed the hardcoded STT fallback in `whisperTranscriber.ts`. Removed the hardcoded silence windows fallback in `sileroVad.ts`. Added a robust Rust IPC contract test (`src-tauri/src/tests/contract_test.rs`) that parses all TS `invoke` calls and ensures they match `tauri::generate_handler!`. Removed the now-obsolete `runtimeMode.test.ts` assertions for demo mode hardcoded stubs.
- **Verified:**
  - `cargo test --manifest-path src-tauri/Cargo.toml` -> Passed.
  - `npm run build && npm run test && npm run lint` -> Passed.
- **Left undone:** None
- **Next:** R11.2 (Unblock WebGPU pipeline)
- **Blockers:** None
