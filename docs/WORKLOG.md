## 2024-05-16 — Jules — R8.2
- **Did:** Implemented dynamic hardware encoder detection for FFmpeg. Added `get_available_encoders` to Tauri Rust backend via `export_native.rs` and `main.rs`. Added `getAvailableEncoders` to `nativeBridge.ts`. Updated `ExportModal.tsx` to detect and conditionally show appropriate hardware encoders or gracefully fall back to Software x264. Wrote React Testing Library tests in `ExportModal.test.tsx`.
- **Verified:** Ran `npm run build`, `npm test` (added vitest setup with jest-dom), `npm run lint`, and `cd src-tauri && cargo check`.
- **Left undone:** N/A
- **Next:** Start working on R8.3 Batch export queue.
- **Blockers:** N/A
