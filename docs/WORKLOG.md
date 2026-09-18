## 2024-05-16 — Jules — R8.2
- **Did:** Implemented dynamic hardware encoder detection for FFmpeg. Added `get_available_encoders` to Tauri Rust backend via `export_native.rs` and `main.rs`. Added `getAvailableEncoders` to `nativeBridge.ts`. Updated `ExportModal.tsx` to detect and conditionally show appropriate hardware encoders or gracefully fall back to Software x264. Wrote React Testing Library tests in `ExportModal.test.tsx`.
- **Verified:** Ran `npm run build`, `npm test` (added vitest setup with jest-dom), `npm run lint`, and `cd src-tauri && cargo check`.
- **Left undone:** N/A
- **Next:** Start working on R8.3 Batch export queue.
- **Blockers:** N/A
## 2024-09-18 — Jules — R8.3
- **Did:** Implemented the batch export queue. Created a new Zustand store `exportQueue.ts` to manage job statuses (idle, processing, done, failed). Added `ExportQueue.tsx` component to render the jobs and updated `ExportModal.tsx` to add jobs to the queue instead of immediately blocking execution. Added unit tests for sequential queue processing.
- **Verified:** Ran `npm run build`, `npm run test`, and `npm run lint`. Verified UI visually with Playwright snapshot confirming sequential job additions and explicit failure catching.
- **Left undone:** None
- **Next:** R8.4 — Installers & leak audit.
- **Blockers:** None
