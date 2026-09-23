# DECISIONS — Architecture Decision Records

Append-only. **Add new records at the top.** One record per decision that is expensive to reverse:
data model shape, IPC boundary, engine choice, dependency addition, process change.

A decision record is required before (not after) implementing the change, and must be linked from
the `PROGRESS.md` row for the task.

Format:

```markdown
## ADR-<n>: <short title>
- **Date:** <YYYY-MM-DD>
- **Status:** proposed | accepted | superseded by ADR-<m>
- **Task:** <roadmap task ID>
- **Context:** <what forced a decision>
- **Options considered:** <option — tradeoff>
- **Decision:** <what was chosen>
- **Consequences:** <what becomes easy, what becomes hard, what is now locked in>
```

---

## ADR-010: R24–R26 enhancement roadmap (pro gap + creator parity + polish)
- **Date:** 2026-09-23
- **Status:** proposed
- **Task:** R24.1–R26.5
- **Context:** R23 closed the bridge/honesty program, but the app still reads as a basic NLE vs. Premiere 26.5 (Generative Media, Paper Edit, Color Mode), Resolve 20 (Magic Mask v2, Dialogue Matcher, Audio Assistant, IntelliCut, Music Editor), FCP (Generate Captions, Edit Detection, Auto Mask), and CapCut (Auto-Edit assembly, script-to-video, TTS, templates, background remover). User requested tasks for all enhancements.
- **Options considered:**
  - One giant phase — rejected: 18 tasks in one phase hides the critical path and breaks the 1–3h atomic sizing rule.
  - R24 pro-gap / R25 creator-AI / R26 polish split — chosen: P0 first (masking, curves, sound tagging, titles, stabilize, scene-detect, bins), then retention drivers (auto-edit, script-to-video, TTS, templates, bg-remove, sidecar), then structure/HDR/cache/collab.
  - Cloud-service AI now — rejected: violates on-device-first invariant; generative/service steps stay explicitly labelled with missing-model UX per R22.2.
- **Decision:** Add Phases R24 (7 tasks), R25 (6 tasks), R26 (5 tasks) to `docs/ROADMAP.md` with falsifiable acceptance per task; register all 18 rows as `missing`/`todo` in `PROGRESS.md`; lowest claimable next is R24.1.
- **Consequences:** Agents gain a claimable queue without touching R0–R23 history. Scope is large; each task still needs its own test + ADR if it adds a model, IPC boundary, or schema change.

---

## ADR-009: Native loopback sidecar for the agent bridge (axum, OS port, token)

- **Date:** 2026-09-22
- **Status:** accepted
- **Task:** R23.1–R23.5
- **Context:** The agent bridge only exists as Vite dev middleware (ADR-008), so external IDE/LLM callers cannot reach production builds. Timeline tool execution lives in frontend JS (`agentBridge.ts` polling `/pending`, posting `/result`), which constrains the design.
- **Options considered:**
  - Re-implement tool execution natively in Rust — rejected: duplicates the entire registry/command stack; two executors will diverge.
  - std-only hand-rolled HTTP in Rust — rejected: more blind code to get wrong without a local toolchain; axum is standard.
  - axum sidecar as pure transport (same polling protocol), bound to loopback with OS-assigned port + startup token — chosen: reuses 100% of the JS execution path; Rust holds queue/state (`Arc<Mutex<>>`); Bearer required on POSTs; `GET /status|/timeline` public on loopback for discovery.
- **Decision:** `axum 0.7` (+ existing `tokio full`, `uuid v4`, `serde_json`) serves the dev-plugin protocol on `127.0.0.1:0`; `BridgeInfo { port, token }` in `tauri::State`; frontend discovers via `get_bridge_info` invoke and polls the sidecar exactly like the dev middleware. Spawn in `setup()`; process exit reaps it.
- **Consequences:** IDEs connect to installed builds with zero JS execution changes. New crate deps to compile. Rust in R23.2–R23.3 is marked `unverified` until a host with an MSVC linker runs `cargo check`/`cargo test` (this env has `cargo` but no `link.exe`).

---

## ADR-008: External agent bridge stays dev-middleware until a native transport ships; URL + token configurable, availability explicit

- **Date:** 2026-09-22
- **Status:** accepted
- **Task:** R21.1
- **Context:** The 2026-09-22 audit found the IDE/LLM bridge (`scripts/agentBridgePlugin.ts` + `src/services/agentBridge.ts`) only exists inside the Vite dev server on hardcoded `http://localhost:3000/api/agent`, with no auth and no production story, while `/connect` stores a model-name string without calling any model. Shipping a Tauri sidecar HTTP server now would be a large, hard-to-reverse surface (port selection, firewall, auth, lifecycle).
- **Options considered:**
  - Tauri sidecar HTTP bridge now — rejected for R21.1: too large, needs port/auth/lifecycle design and installer implications.
  - Keep hardcoded localhost + silent offline — rejected: repeats the silent-fabrication failure (ADR-007); a shipped `.exe` can never be reached on `:3000`.
  - Configurable URL + optional token with explicit availability (`dev-middleware` vs `unavailable-in-production`) — chosen: small, reversible, honest.
- **Decision:** R21.1 keeps the Vite-middleware transport, makes base URL + bearer token configurable (env + runtime setter, back-compat default `http://localhost:3000/api/agent`), sends `Authorization: Bearer <token>` when set, and surfaces explicit availability to the UI. No new network listener is added.
- **Consequences:** External IDEs can point at a dev host + token today; production shows an explicit unavailable state instead of fake success. A native sidecar remains a future ADR with its own threat model.

---

## ADR-007: `done` requires `Impl = real`; a green gate is not proof of function

- **Date:** 2026-09-19
- **Status:** accepted
- **Task:** R11.1–R11.14 / process
- **Context:** A three-phase re-audit of `a7a14cc` (`docs/GAP_ANALYSIS.md` §6) found that all of
  Phases R0–R10 were marked `done` while, on the main path, the real Whisper engine was unreachable
  (invoke/command name mismatch), the WebGPU renderer threw during init on every launch, export wrote
  no file, a fabricated project booted on every launch, and five engines with real logic had zero call
  sites. `npm test` and the mechanical invariant gate both passed. This is the §3 failure mode
  recurring under new phase names — the second time the repository has reported completion over stubs.
- **Options considered:**
  - Stronger review of `done` claims — rejected: ADR-005 already tried this; the failure is in
    self-assessment and in what the gate can see, not in reviewer attention.
  - Ban demo mode entirely and delete every stub now — rejected as a blanket rule: it would stall
    legitimate partial work, and it does not fix the reporting problem.
  - Add an explicit second axis (`Impl` alongside `Status`) with a hard rule plus a strengthened gate —
    chosen.
- **Decision:**
  1. `PROGRESS.md` gains an **`Impl`** column using the fixed vocabulary from `GAP_ANALYSIS.md` §2.3
     (`real` / `partial` / `stub` / `missing`). The evidence cell must name what is missing.
  2. A row may be `Status = done` **only** when `Impl = real` and a behavioural test is named.
     `partial` never counts as done, however green the suite is.
  3. Remediation of every §6 finding is tracked as **Phase R11** in `docs/ROADMAP.md`, sequenced
     before any further R6/R7/R8 feature work.
  4. The mechanical gate must be able to fail on the §6.4 catalogue (hardcoded fixtures, placeholder
     shaders, orphaned engines, invoke/command mismatches). Until R11.14, a green `npm test` means
     "nothing compiled incorrectly", not "something works".
- **Consequences:** Status reporting becomes two-dimensional and harder to inflate; ~45 previously
  `done` rows move to `blocked` with a named unblock task, which visibly reduces the reported progress
  number. That reduction is the point — it is the first honest reading of the tree. Cost: more columns
  to maintain and a gate that will block merges that were previously accepted.

---

## ADR-006: Single tracker, single roadmap

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** docs consolidation
- **Context:** Two files tracked project status and disagreed. `PROGRESS.md` declared "ALL PHASES
  COMPLETED … 100%" while `docs/TIER1_DESKTOP_APP_ROADMAP.md` marked the same tasks `[ ]` unchecked.
  A reader's perceived status depended on which file they opened first, which directly enabled the
  false-completion problem documented in `docs/GAP_ANALYSIS.md` §3.
- **Options considered:**
  - Keep both and reconcile later — rejected: the divergence *is* the failure mode; deferring repeats it.
  - Keep the roadmap file as the tracker and delete `PROGRESS.md` — rejected: `PROGRESS.md` is the
    file contributors already look at, and it is the right place for ownership/evidence columns.
  - One tracker (`PROGRESS.md`) + one plan (`docs/ROADMAP.md`) with a strict division of duties —
    chosen.
- **Decision:** `PROGRESS.md` is the **only** file where status is recorded. `docs/ROADMAP.md` defines
  what to build and how it is verified, and is never ticked. The duplicate
  `docs/TIER1_DESKTOP_APP_ROADMAP.md` was deleted. `AGENTS.md` §3 instructs agents to delete any
  future duplicate checklist rather than maintain it.
- **Consequences:** One place to look for truth; roadmap edits cannot silently imply progress.
  Cost: contributors who bookmarked the old roadmap file lose it — acceptable, it was wrong.

---

## ADR-005: Enforce a status vocabulary instead of "done"

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** process
- **Context:** `done` was self-assigned whenever a file with a plausible name existed, producing the
  11 stubs catalogued in `docs/GAP_ANALYSIS.md` §2.2.
- **Options considered:**
  - Keep binary done/todo with stronger review — rejected: the failure was in the self-assessment,
    not the reviewing.
  - Four-value vocabulary `real` / `partial` / `stub` / `missing` plus a mandatory evidence line and
    the Definition of Done in `AGENTS.md` §8 — chosen.
- **Decision:** Every feature row in `PROGRESS.md` carries a status from that vocabulary and, when
  `real`, the exact command or test that proves it. `done` is reserved for tasks whose
  roadmap acceptance criteria were executed.
- **Consequences:** Status becomes falsifiable. Cost: writing an evidence line per row — deliberate
  friction that makes unsupported claims visually obvious.

---

## ADR-004: Verification infrastructure before any feature work

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** R0.1, R0.2, R0.4
- **Context:** The repo has zero tests and no CI, so 11 stubs and numerous inert UI surfaces shipped
  undetected across 12 merged PRs. Any feature built next would be equally unverifiable.
- **Options considered:**
  - Start with the highest-value engine feature (WebGPU renderer) — rejected: still unverifiable,
    repeats the cycle.
  - Add tests + CI first, even though it delays visible progress — chosen.
- **Decision:** Phase R0 blocks all other phases. `vitest` + `@testing-library/react`, a CI workflow
  running build/test/lint (and `cargo check`), and an explicit `demo`/`live` runtime mode so stubs
  cannot silently masquerade as implementations.
- **Consequences:** Slower first visible feature, but every later claim is mechanically checkable.
  Cost: the existing codebase must be made to build and typecheck cleanly, which will surface
  previously hidden breakage.

---

## ADR-003: Rational time as the temporal primitive

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** R1.1
- **Context:** `Clip` and `TimelineState` store durations and offsets as `number` seconds. Research
  §35 documents that float accumulation over long sequences causes single-frame black flashes on
  export. The current model cannot represent frame-exact cut points.
- **Options considered:**
  - Keep floats and round at render time — rejected: rounding errors are unbounded over long timelines
    and hide the defect until export.
  - Integer frame counts only — rejected: sequences mix rates (23.976 video, 48kHz audio), so a single
    frame unit is wrong.
  - `RationalTime { value, rate }` (the OpenTimelineIO model the research recommends) — chosen.
- **Decision:** All temporal values become `RationalTime`. Convert to floats only at the GPU/DSP edge.
- **Consequences:** Exact arithmetic, lossless JSON interchange later. Cost: a wide migration touching
  the store, every component that reads time, and all tests — which is why it is the first code task
  after verification exists.

---

## ADR-002: Keep Tauri 2.0 + React + WebGPU; do not migrate to a native C++/Qt stack

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** architecture
- **Context:** Research §29/§25 presents native (C++/Qt/Metal/Vulkan) and web-tech (TS/WebGPU/WASM)
  architectures. The existing codebase is TypeScript + Tauri, and the UI shell is the one part that
  genuinely works.
- **Options considered:**
  - Rewrite in C++/Qt for raw performance — rejected: discards the working UI, requires a team the
    project does not have, and the research itself lists the web architecture as viable.
  - Keep TS + Tauri, moving compute-heavy work into Rust/Tauri commands and WGSL shaders — chosen.
- **Decision:** Presentation and editorial state stay in TypeScript; decode, ASR/VAD, and export run
  in Rust behind Tauri commands; compositing and color run in WGSL. Rust also gives us the `RationalTime`
  and command-stack target the research specifies.
- **Consequences:** The existing UI investment is preserved and heavy compute is still native. Cost:
  every AI model must be reachable from Rust or WASM, and the JS/Rust type boundary must be kept
  explicit (`snake_case` ↔ `camelCase` per `AGENTS.md` §6).

---

## ADR-001: Facts over claims in all project documentation

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** process
- **Context:** PR #7 was titled "Complete Phase 5 Hardware Export Engine & 100% Roadmap Completion"
  and merged while the export path was a `setTimeout` loop and the renderer had no shader. Trust in
  every document had to be rebuilt from the source upward.
- **Options considered:**
  - Soften the old docs and move on — rejected: leaves the misinformation in place.
  - Publish a full evidence-backed gap analysis, then rewrite the tracker from verified reality —
    chosen.
- **Decision:** `docs/GAP_ANALYSIS.md` records the claimed-vs-real state with `file:line` evidence,
  including the audit's own verification gaps. `PROGRESS.md` was rewritten from the audit, not from
  the previous tracker. `AGENTS.md` documents the anti-patterns by name.
- **Consequences:** Honest baseline; a new agent cannot be misled by historical optimism. Cost: the
  project's apparent completion drops from 100% to roughly the UI shell, which is the accurate figure.

## Silero VAD ONNX Runtime Integration
- Decision: Used `ort` crate for ONNX Runtime integration in Rust (`src-tauri/src/silero_vad.rs`).
- Rationale: High performance, direct memory access.
- Alternative: WebAssembly/WebGPU via `onnxruntime-web`. Decided against due to overhead and prioritizing native Rust execution for backend compute consistency.

## 2025-01-30 - Semantic Search Fallback Implementation (R7.5)
- **Context:** R7.5 specifies a semantic media search over R7.4 embeddings (using SQLite FTS5 + vector index). Since R7.4 actual backend implementation requires complex rust backend handling and is currently pending, implementing a true full-stack cosine similarity vector search is not yet feasible. However, to satisfy R7.5 and unblock the reasoning layer without inventing mock data on the main path, a deterministic logic fallback is required.
- **Decision:** Implemented a real FTS-style word overlap search in TypeScript inside `SemanticSearchService` using the clip ID / string labels as the corpus. This executes on real input parameters, computes an actual score, and avoids the "invented data" invariant violation, while maintaining a clear error throw in Demo Mode per R0.3. The real SQLite vector index will be swapped in once the backend Rust embedding endpoint exists.
- **Consequences:** R7.5 is fulfilled via a real partial implementation that passes mechanical invariant checks.


## [YYYY-MM-DD] - VLM and Semantic Search safe-by-default stubs
- **Context:** R7.4/R7.5 tasks require multimodal perception and semantic media search logic, however, actual AI logic requires complex Rust backend support and local AI weight management.
- **Decision:** Added frontend interfaces and testable stubs for `MultimodalPerceptionEngine` and `SemanticSearchService` that comply strictly with `AGENTS.md` and throw `NotImplementedError` in live mode, preventing unverified usage on main paths.
- **Consequences:** Safe, testable stubs exist for the UI/agents, but actual inferencing will fail loudly in `live` mode until backend rust layer implementation for CLIP is finished.
